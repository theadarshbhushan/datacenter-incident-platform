"""
Cookie-based session authentication, CSRF protection and organization-scoped access control.

- The session secret lives only in the `vw_session` cookie (HttpOnly, Secure, SameSite). The
  database keeps its SHA-256 hash, so a database leak does not leak usable sessions.
- CSRF uses a signed double-submit token: `vw_csrf` cookie + `X-CSRF-Token` header must match and
  carry a valid HMAC. GET /auth/csrf hands the token to the SPA, which keeps it in memory only.
- `require_org(permission)` resolves the caller's organization from their membership, never from
  client input, so one organization can never read or change another's data.
"""
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, Optional

from beanie import PydanticObjectId
from fastapi import Depends, Request, Response
from loguru import logger
from passlib.context import CryptContext

from app.core.config import settings
from app.core.errors import ApiException, forbidden, unauthorized
from app.core.permissions import can
from app.core.tokens import hash_token, new_token, safe_equals
from app.models.account import Membership, Organization, UserSession
from app.models.user import User

SESSION_COOKIE = "vw_session"
CSRF_COOKIE = "vw_csrf"
CSRF_HEADER = "x-csrf-token"

# bcrypt_sha256 avoids bcrypt's silent 72-byte truncation; plain bcrypt hashes from older accounts still verify.
pwd_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")
_DUMMY_HASH = pwd_context.hash("vaultwatch-timing-equalizer")

_secret = settings.secret_key
if not _secret:
    if not settings.is_development:
        raise RuntimeError("SECRET_KEY must be set outside development.")
    _secret = secrets.token_urlsafe(48)
    logger.warning("SECRET_KEY is not set; using a random development key (CSRF tokens reset on restart).")
elif not settings.is_development and (len(_secret) < 32 or "changeme" in _secret):
    raise RuntimeError("SECRET_KEY is too weak. Use at least 32 random characters.")
_SECRET = _secret.encode("utf-8")


# ---------- passwords ----------

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: Optional[str]) -> bool:
    """Constant work whether or not the account exists."""
    if not hashed:
        pwd_context.verify(password, _DUMMY_HASH)
        return False
    try:
        return pwd_context.verify(password, hashed)
    except (ValueError, TypeError):
        return False


# ---------- request helpers ----------

def client_ip(request: Request) -> str:
    if settings.TRUST_PROXY_HEADERS:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def device_label(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    browser = "Edge" if "Edg/" in ua else "Chrome" if "Chrome/" in ua else "Firefox" if "Firefox/" in ua else "Safari" if "Safari/" in ua else "Browser"
    os_ = "Windows" if "Windows" in ua else "macOS" if "Mac OS" in ua else "Android" if "Android" in ua else "iOS" if ("iPhone" in ua or "iPad" in ua) else "Linux" if "Linux" in ua else "Unknown OS"
    return f"{browser} on {os_}"


def _cookie_kwargs() -> dict:
    kw = {"secure": settings.COOKIE_SECURE, "samesite": settings.COOKIE_SAMESITE.lower(), "path": "/"}
    if settings.COOKIE_DOMAIN:
        kw["domain"] = settings.COOKIE_DOMAIN
    return kw


# ---------- CSRF ----------

def _sign(nonce: str) -> str:
    return hmac.new(_SECRET, nonce.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def new_csrf_token() -> str:
    nonce = secrets.token_urlsafe(24)
    return f"{nonce}.{_sign(nonce)}"


def csrf_token_valid(token: Optional[str]) -> bool:
    if not token or "." not in token:
        return False
    nonce, sig = token.rsplit(".", 1)
    return safe_equals(sig, _sign(nonce))


def set_csrf_cookie(response: Response, token: str) -> None:
    # Readable by same-origin scripts by design (double submit); it grants nothing on its own.
    response.set_cookie(CSRF_COOKIE, token, httponly=False, max_age=60 * 60 * 24 * 30, **_cookie_kwargs())


def check_csrf(request: Request) -> bool:
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    return bool(cookie and header and safe_equals(cookie, header) and csrf_token_valid(header))


def origin_allowed(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return True  # non-browser clients; the CSRF token still applies to cookie requests
    allowed = set(settings.cors_origins)
    allowed.add(str(request.base_url).rstrip("/"))
    return origin.rstrip("/") in allowed


# ---------- sessions ----------

async def start_session(request: Request, response: Response, user: User, remember: bool, org_id: Optional[str] = None) -> UserSession:
    token = new_token(32)
    ttl = timedelta(days=settings.SESSION_REMEMBER_DAYS) if remember else timedelta(hours=settings.SESSION_TTL_HOURS)
    session = UserSession(
        token_hash=hash_token(token), user_id=str(user.id), org_id=org_id, device=device_label(request),
        ip=client_ip(request), remember=remember, expires_at=datetime.utcnow() + ttl,
    )
    await session.insert()
    response.set_cookie(
        SESSION_COOKIE, token, httponly=True, max_age=int(ttl.total_seconds()) if remember else None, **_cookie_kwargs(),
    )
    # Rotate the CSRF token whenever the authentication state changes.
    set_csrf_cookie(response, new_csrf_token())
    return session


async def end_session(request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await UserSession.find(UserSession.token_hash == hash_token(token)).delete()
    response.delete_cookie(SESSION_COOKIE, **_cookie_kwargs())
    set_csrf_cookie(response, new_csrf_token())


async def end_all_sessions(user_id: str, keep_session_id: Optional[str] = None) -> None:
    q = {"user_id": user_id}
    if keep_session_id:
        q["_id"] = {"$ne": keep_session_id}
    await UserSession.find(q).delete()


@dataclass
class AuthContext:
    user: User
    session: UserSession


@dataclass
class OrgContext:
    user: User
    session: UserSession
    org: Organization
    role: str

    @property
    def org_id(self) -> str:
        return self.org.id


async def load_user(user_id: str) -> Optional[User]:
    try:
        return await User.get(PydanticObjectId(user_id))
    except Exception:
        return None


async def current_auth(request: Request) -> Optional[AuthContext]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token or len(token) > 256:
        return None
    session = await UserSession.find_one(UserSession.token_hash == hash_token(token))
    if not session:
        return None
    now = datetime.utcnow()
    if session.expires_at < now:
        await session.delete()
        return None
    user = await load_user(session.user_id)
    if not user or not user.is_active:
        return None
    if (now - session.last_active).total_seconds() > 60:
        session.last_active = now
        if not session.remember:  # sliding expiry for browser sessions
            session.expires_at = now + timedelta(hours=settings.SESSION_TTL_HOURS)
        await session.save()
    return AuthContext(user=user, session=session)


async def require_user(request: Request) -> AuthContext:
    ctx = await current_auth(request)
    if not ctx:
        raise unauthorized()
    return ctx


async def resolve_org(ctx: AuthContext) -> Optional[tuple[Organization, str]]:
    """The session's organization if the user still belongs to it, else their first membership."""
    memberships = await Membership.find(Membership.user_id == str(ctx.user.id)).sort("+joined_at").to_list()
    if not memberships:
        return None
    m = next((x for x in memberships if x.org_id == ctx.session.org_id), memberships[0])
    org = await Organization.get(m.org_id)
    if not org:
        return None
    if ctx.session.org_id != org.id:
        ctx.session.org_id = org.id
        await ctx.session.save()
    return org, m.role


def require_org(permission: Optional[str] = None) -> Callable:
    async def dep(ctx: AuthContext = Depends(require_user)) -> OrgContext:
        resolved = await resolve_org(ctx)
        if not resolved:
            raise ApiException(403, "You are not a member of an organization yet.", "no_org")
        org, role = resolved
        if permission and not can(role, permission):
            raise forbidden()
        return OrgContext(user=ctx.user, session=ctx.session, org=org, role=role)

    return dep


def require_internal(request: Request) -> None:
    """Service-to-service routes (legacy telemetry API). Disabled unless INTERNAL_API_TOKEN is set."""
    expected = settings.INTERNAL_API_TOKEN
    supplied = request.headers.get("x-internal-token", "")
    if not expected or not supplied or not safe_equals(supplied, expected):
        raise ApiException(403, "This endpoint is restricted to internal services.", "internal_only")
