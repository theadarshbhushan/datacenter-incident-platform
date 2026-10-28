"""
Accounts, organizations and the per-organization workspace.

Every organization-owned document carries `org_id`, and every query for one is filtered by the
org_id of the caller's verified membership (see app.core.auth.require_org). Secrets (session
tokens, reset/verification tokens, invitation tokens, API keys) are stored only as SHA-256 hashes.
"""
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional

import pymongo
from beanie import Document, Indexed
from pydantic import Field


def new_id(prefix: str) -> str:
    return f"{prefix}{secrets.token_hex(8)}"


class Organization(Document):
    id: str = Field(default_factory=lambda: new_id("org_"))
    name: str
    size: str = ""
    industry: str = ""
    plan: str = "trial"  # trial / team / business; changing it never charges anyone
    environment_type: str = "hybrid"
    monitoring_mode: str = "later"  # demo / connect / later
    created_at: datetime = Field(default_factory=datetime.utcnow)
    trial_ends_at: datetime

    class Settings:
        name = "organizations"


class Membership(Document):
    org_id: str
    user_id: str
    role: str  # owner / admin / engineer / viewer
    joined_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "memberships"
        indexes = [
            pymongo.IndexModel([("org_id", 1), ("user_id", 1)], unique=True),
            pymongo.IndexModel([("user_id", 1)]),
        ]


class Invitation(Document):
    id: str = Field(default_factory=lambda: new_id("inv_"))
    org_id: Indexed(str)
    email: str
    role: str
    status: str = "pending"  # pending / accepted / declined / revoked / expired
    invited_by: str
    token_hash: Indexed(str)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime

    class Settings:
        name = "invitations"


class AuthToken(Document):
    """Single-use, expiring token for password reset ("reset") and email verification ("verify")."""

    token_hash: Indexed(str, unique=True)
    kind: str
    user_id: str
    email: str
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "auth_tokens"
        indexes = [
            pymongo.IndexModel([("user_id", 1), ("kind", 1)]),
            # Keep expired tokens a week so old links still say "expired", then let MongoDB delete them.
            pymongo.IndexModel([("expires_at", 1)], expireAfterSeconds=7 * 24 * 3600),
        ]


class UserSession(Document):
    id: str = Field(default_factory=lambda: new_id("ses_"))  # public, non-secret identifier
    token_hash: Indexed(str, unique=True)  # SHA-256 of the cookie value
    user_id: Indexed(str)
    org_id: Optional[str] = None
    device: str = "Unknown device"
    ip: str = ""
    remember: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime

    class Settings:
        name = "user_sessions"
        indexes = [pymongo.IndexModel([("expires_at", 1)], expireAfterSeconds=0)]


class ApiKey(Document):
    id: str = Field(default_factory=lambda: new_id("key_"))
    org_id: Indexed(str)
    name: str
    prefix: str
    key_hash: Indexed(str, unique=True)
    scopes: List[str] = Field(default_factory=list)
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None

    class Settings:
        name = "api_keys"


class OnboardingDraft(Document):
    user_id: Indexed(str, unique=True)
    step: int = 0
    draft: Dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "onboarding_drafts"


class OrgWorkspace(Document):
    """
    Per-organization settings: notification channels and monitoring configuration.

    Older versions also embedded data centers, racks, servers, predictions and alert rules here. Migration
    0002 moves those into their own collections; the legacy fields stay declared so old rows still load.
    """

    id: str  # the organization id
    notification_settings: Dict[str, Any] = Field(default_factory=dict)
    monitoring: Dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # legacy (read only by migrations)
    data_centers: Optional[List[Dict[str, Any]]] = None
    racks: Optional[List[Dict[str, Any]]] = None
    servers: Optional[List[Dict[str, Any]]] = None
    predictions: Optional[List[Dict[str, Any]]] = None
    model: Optional[Dict[str, Any]] = None
    alert_rules: Optional[List[Dict[str, Any]]] = None
    sample: Optional[bool] = None

    class Settings:
        name = "org_workspaces"


class WorkspaceIncident(Document):
    """
    An incident. `data` holds the API shape (camelCase, including the timeline, which is the incident
    history). Top-level fields mirror the parts of it that queries, deduplication and reports need.
    """

    org_id: str
    incident_id: str  # e.g. INC-2026-0135, unique within the organization
    created_at: datetime
    data: Dict[str, Any]
    status: str = "ongoing"
    severity: str = "minor"
    category: str = ""
    server_ids: List[str] = Field(default_factory=list)
    rack_id: str = ""
    resolved_at: Optional[datetime] = None
    dedup_key: Optional[str] = None       # set for automatically created incidents
    last_signal_at: Optional[datetime] = None
    demo: bool = False

    class Settings:
        name = "workspace_incidents"
        indexes = [
            pymongo.IndexModel([("org_id", 1), ("incident_id", 1)], unique=True),
            pymongo.IndexModel([("org_id", 1), ("created_at", -1)]),
            pymongo.IndexModel([("org_id", 1), ("status", 1), ("dedup_key", 1)]),
        ]

    def sync(self) -> "WorkspaceIncident":
        d = self.data
        self.status, self.severity, self.category = d["status"], d["severity"], d["category"]
        self.server_ids, self.rack_id = list(d.get("serverIds", [])), d.get("rackId", "")
        self.resolved_at = _parse_iso(d.get("resolvedAt"))
        return self


class WorkspaceAlert(Document):
    org_id: str
    alert_id: str
    created_at: datetime
    data: Dict[str, Any]
    status: str = "active"
    server_id: Optional[str] = None
    dedup_key: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    demo: bool = False

    class Settings:
        name = "workspace_alerts"
        indexes = [
            pymongo.IndexModel([("org_id", 1), ("alert_id", 1)], unique=True),
            pymongo.IndexModel([("org_id", 1), ("created_at", -1)]),
            pymongo.IndexModel([("org_id", 1), ("status", 1), ("dedup_key", 1)]),
        ]

    def sync(self) -> "WorkspaceAlert":
        self.status, self.server_id = self.data["status"], self.data.get("serverId")
        return self


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    from app.core.timeutil import parse_iso

    return parse_iso(value)


class AuditEntry(Document):
    org_id: str
    at: datetime = Field(default_factory=datetime.utcnow)
    actor: str
    action: str

    class Settings:
        name = "audit_log"
        indexes = [pymongo.IndexModel([("org_id", 1), ("at", -1)])]


class DevMail(Document):
    """Development-only copy of console emails, served by GET /dev/mail. Never used with SMTP."""

    to: str
    subject: str
    body: str
    link: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "dev_mail"
        indexes = [pymongo.IndexModel([("created_at", 1)], expireAfterSeconds=24 * 3600)]


class ContactMessage(Document):
    name: str
    email: str
    company: str = ""
    subject: str
    message: str
    delivered: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "contact_messages"


ACCOUNT_MODELS = [
    Organization, Membership, Invitation, AuthToken, UserSession, ApiKey, OnboardingDraft, OrgWorkspace,
    WorkspaceIncident, WorkspaceAlert, AuditEntry, DevMail, ContactMessage,
]
