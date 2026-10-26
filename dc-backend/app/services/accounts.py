"""Shared account logic and the JSON shapes the frontend expects (see dc-frontend/src/types/domain.ts)."""
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from app.core.auth import AuthContext, resolve_org
from app.core.mailer import send_email
from app.core.tokens import hash_token, new_token
from app.models.account import AuditEntry, AuthToken, Invitation, Membership, Organization, UserSession
from app.models.user import User
from app.services.sample_data import iso

AVATAR_COLORS = ["#16834A", "#2563EB", "#7C3AED", "#D97706", "#DB2777", "#0891B2"]
ROLE_LABELS = {"owner": "Owner", "admin": "Admin", "engineer": "Engineer", "viewer": "Viewer"}

RESET_TTL = timedelta(minutes=30)
VERIFY_TTL = timedelta(hours=24)
INVITE_TTL = timedelta(days=7)
TRIAL_DAYS = 14


def normalize_email(email: str) -> str:
    return email.strip().lower()


def user_public(u: User) -> dict:
    return {
        "id": str(u.id),
        "name": u.full_name,
        "email": u.email,
        "emailVerified": u.email_verified,
        "avatarColor": u.avatar_color,
        "jobTitle": u.job_title,
        "createdAt": iso(u.created_at),
        "onboardingCompleted": u.onboarding_completed,
        "preferences": {**{"timezone": "UTC", "dateFormat": "relative", "emailDigest": "weekly", "compactTables": False}, **(u.preferences or {})},
    }


def org_public(o: Organization) -> dict:
    return {
        "id": o.id,
        "name": o.name,
        "size": o.size,
        "industry": o.industry,
        "plan": o.plan,
        "environmentType": o.environment_type,
        "monitoringMode": o.monitoring_mode,
        "createdAt": iso(o.created_at),
        "trialEndsAt": iso(o.trial_ends_at),
    }


def invitation_public(i: Invitation) -> dict:
    status = i.status
    if status == "pending" and i.expires_at < datetime.utcnow():
        status = "expired"
    return {
        "id": i.id, "orgId": i.org_id, "email": i.email, "role": i.role, "status": status,
        "invitedBy": i.invited_by, "createdAt": iso(i.created_at), "expiresAt": iso(i.expires_at),
    }


async def build_session(ctx: AuthContext) -> dict:
    resolved = await resolve_org(ctx)
    memberships = await Membership.find(Membership.user_id == str(ctx.user.id)).sort("+joined_at").to_list()
    orgs = {o.id: o for o in await Organization.find({"_id": {"$in": [m.org_id for m in memberships]}}).to_list()}
    return {
        "user": user_public(ctx.user),
        "organization": org_public(resolved[0]) if resolved else None,
        "role": resolved[1] if resolved else None,
        "organizations": [{"id": m.org_id, "name": orgs[m.org_id].name, "role": m.role} for m in memberships if m.org_id in orgs],
        "mode": "api",
    }


async def list_members(org_id: str) -> List[dict]:
    memberships = await Membership.find(Membership.org_id == org_id).sort("+joined_at").to_list()
    out = []
    for m in memberships:
        from app.core.auth import load_user

        u = await load_user(m.user_id)
        if not u:
            continue
        last = await UserSession.find(UserSession.user_id == m.user_id).sort("-last_active").first_or_none()
        out.append({
            "userId": m.user_id, "name": u.full_name, "email": u.email, "role": m.role, "joinedAt": iso(m.joined_at),
            "avatarColor": u.avatar_color, "lastActive": iso(last.last_active) if last else None,
        })
    return out


async def audit(org_id: str, actor: str, action: str) -> None:
    await AuditEntry(org_id=org_id, actor=actor, action=action[:300]).insert()


async def issue_auth_token(kind: str, user: User, ttl: timedelta) -> str:
    """Create a single-use token and invalidate older unused tokens of the same kind for the user."""
    now = datetime.utcnow()
    await AuthToken.find({"user_id": str(user.id), "kind": kind, "used_at": None}).update({"$set": {"used_at": now}})
    token = new_token(32)
    await AuthToken(token_hash=hash_token(token), kind=kind, user_id=str(user.id), email=user.email, expires_at=now + ttl).insert()
    return token


async def find_auth_token(token: str, kind: str) -> Tuple[str, Optional[AuthToken]]:
    if not token or len(token) < 8 or len(token) > 256:
        return "invalid", None
    record = await AuthToken.find_one({"token_hash": hash_token(token), "kind": kind})
    if not record:
        return "invalid", None
    if record.used_at:
        return "used", record
    if record.expires_at < datetime.utcnow():
        return "expired", record
    return "valid", record


async def send_verification(user: User) -> None:
    token = await issue_auth_token("verify", user, VERIFY_TTL)
    await send_email(
        user.email, "Verify your VaultWatch email address",
        "Confirm your email to finish creating your account. The link expires in 24 hours.",
        f"/verify-email?token={token}",
    )


async def find_invitation(token: str) -> Tuple[str, Optional[Invitation]]:
    if not token or len(token) < 8 or len(token) > 256:
        return "invalid", None
    inv = await Invitation.find_one(Invitation.token_hash == hash_token(token))
    if not inv:
        return "invalid", None
    if inv.status != "pending":
        return ("expired" if inv.status == "expired" else "used"), inv
    if inv.expires_at < datetime.utcnow():
        return "expired", inv
    return "valid", inv


async def create_invitation(org: Organization, inviter: User, email: str, role: str) -> Invitation:
    token = new_token(32)
    inv = Invitation(
        org_id=org.id, email=normalize_email(email), role=role, invited_by=inviter.full_name,
        token_hash=hash_token(token), expires_at=datetime.utcnow() + INVITE_TTL,
    )
    await inv.insert()
    await send_invitation_email(inv, org, inviter, token)
    await audit(org.id, inviter.full_name, f"Invited {inv.email} as {role}")
    return inv


async def send_invitation_email(inv: Invitation, org: Organization, inviter: User, token: str) -> None:
    await send_email(
        inv.email, f"{inviter.full_name} invited you to {org.name} on VaultWatch",
        f"Accept the invitation to join as {ROLE_LABELS.get(inv.role, inv.role)}. The link expires in 7 days.",
        f"/accept-invitation?token={token}",
    )


async def new_organization(name: str) -> Organization:
    now = datetime.utcnow()
    org = Organization(name=name.strip()[:120], trial_ends_at=now + timedelta(days=TRIAL_DAYS))
    await org.insert()
    return org
