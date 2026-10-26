from datetime import datetime
from typing import Any, Dict, Optional

from beanie import Document, Indexed
from pydantic import Field


def default_preferences() -> Dict[str, Any]:
    return {"timezone": "UTC", "dateFormat": "relative", "emailDigest": "weekly", "compactTables": False}


class User(Document):
    email: Indexed(str, unique=True)  # always stored lower-case
    hashed_password: str  # bcrypt; never returned by the API
    full_name: str
    role: str = "operator"  # legacy field, unused: roles are per organization (see Membership)
    is_active: bool = True
    email_verified: bool = False
    avatar_color: str = "#16834A"
    job_title: Optional[str] = None
    onboarding_completed: bool = False
    preferences: Dict[str, Any] = Field(default_factory=default_preferences)
    referral: Optional[str] = None
    password_changed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"
