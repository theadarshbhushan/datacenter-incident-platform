from datetime import datetime
from typing import Generic, TypeVar, Optional, Any
from pydantic import BaseModel, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    message: str = "Operation successful"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


def success_response(data: Any = None, message: str = "Operation successful") -> dict:
    return {
        "success": True,
        "data": data,
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
    }


def error_response(message: str = "Operation failed", data: Any = None) -> dict:
    return {
        "success": False,
        "data": data,
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
    }
