import hashlib
import hmac
import secrets


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Tokens (sessions, reset links, invitations, API keys) are stored only as SHA-256 hashes."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def safe_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
