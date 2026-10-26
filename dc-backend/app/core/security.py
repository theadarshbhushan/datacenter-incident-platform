"""
Removed: the previous bearer-JWT helpers (including a "demo token" bypass that accepted any
request as an admin) were replaced by server-side cookie sessions in app.core.auth.
Kept as a thin alias module so older imports fail loudly instead of silently authenticating.
"""
from app.core.auth import hash_password, require_user, verify_password  # noqa: F401

__all__ = ["hash_password", "verify_password", "require_user"]
