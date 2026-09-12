from beanie import Document
from pydantic import Field

class User(Document):
    username: str = Field(unique=True, min_length=3, max_length=50)
    email: str = Field(unique=True)
    hashed_password: str
    role: str = "operator"  # operator, admin, analyst
    is_active: bool = True

    class Settings:
        name = "users"
        indexes = [
            "username",
            "email",
        ]
