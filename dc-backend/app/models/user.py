from datetime import datetime
from typing import Optional
from beanie import Document, Indexed
from pydantic import Field


class User(Document):
    email: Indexed(str, unique=True)
    hashed_password: str
    full_name: str
    role: str = "operator"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"
