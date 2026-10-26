import re

from app.core.errors import ApiException

MIN_LENGTH = 10
MAX_LENGTH = 128


def validate_new_password(password: str, field: str = "password") -> None:
    """Server-side password policy. Mirrors newPasswordField in the frontend schemas."""
    problems = []
    if len(password) < MIN_LENGTH:
        problems.append(f"Use at least {MIN_LENGTH} characters")
    if len(password) > MAX_LENGTH:
        problems.append(f"Use at most {MAX_LENGTH} characters")
    if not (re.search(r"[a-z]", password) and re.search(r"[A-Z]", password)):
        problems.append("Include upper and lower case letters")
    if not re.search(r"\d", password):
        problems.append("Include at least one number")
    if problems:
        raise ApiException(422, problems[0] + ".", "weak_password", {field: problems[0]})
