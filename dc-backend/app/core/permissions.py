"""Role-based access control. The frontend mirrors this matrix in src/utils/permissions.ts."""
from typing import Dict, List

ROLES = ("owner", "admin", "engineer", "viewer")

PERMISSIONS: Dict[str, List[str]] = {
    "org:manage": ["owner"],
    "billing:view": ["owner", "admin"],
    "billing:manage": ["owner"],
    "team:manage": ["owner", "admin"],
    "incident:write": ["owner", "admin", "engineer"],
    "infra:manage": ["owner", "admin"],
    "alert:act": ["owner", "admin", "engineer"],
    "alertRules:manage": ["owner", "admin"],
    "monitoring:manage": ["owner", "admin"],
    "integrations:manage": ["owner", "admin"],
    "apiKeys:manage": ["owner", "admin"],
    "reports:export": ["owner", "admin", "engineer", "viewer"],
}


def can(role: str | None, permission: str) -> bool:
    return bool(role) and role in PERMISSIONS.get(permission, [])


def assignable_roles(actor: str | None) -> List[str]:
    if actor == "owner":
        return list(ROLES)
    if actor == "admin":
        return ["engineer", "viewer"]
    return []


def can_manage_member(actor: str | None, target: str) -> bool:
    if actor == "owner":
        return True
    if actor == "admin":
        return target in ("engineer", "viewer")
    return False
