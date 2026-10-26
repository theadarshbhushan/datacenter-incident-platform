from typing import Dict, Optional


class ApiException(Exception):
    """An error safe to show to the client, with a machine-readable code and optional field errors."""

    def __init__(self, status_code: int, message: str, code: str = "error", fields: Optional[Dict[str, str]] = None):
        self.status_code = status_code
        self.message = message
        self.code = code
        self.fields = fields


def unauthorized(message: str = "Your session has expired. Please sign in again.") -> ApiException:
    return ApiException(401, message, "unauthenticated")


def forbidden(message: str = "Your role does not allow this action.") -> ApiException:
    return ApiException(403, message, "forbidden")


def not_found(message: str = "Not found.") -> ApiException:
    return ApiException(404, message, "not_found")
