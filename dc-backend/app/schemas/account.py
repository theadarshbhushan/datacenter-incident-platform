from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

Role = Literal["owner", "admin", "engineer", "viewer"]


class Strict(BaseModel):
    model_config = {"extra": "ignore", "str_strip_whitespace": True}


class LoginIn(Strict):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    remember: bool = False


class SignupIn(Strict):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    company: str = Field(min_length=2, max_length=120)
    password: str = Field(max_length=256)
    ref: Optional[str] = Field(default=None, max_length=64)


class EmailIn(Strict):
    email: EmailStr


class OptionalEmailIn(Strict):
    email: Optional[EmailStr] = None


class TokenIn(Strict):
    token: str = Field(max_length=256)


class ResetIn(Strict):
    token: str = Field(max_length=256)
    password: str = Field(max_length=256)


class NewAccount(Strict):
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(max_length=256)


class AcceptInviteIn(Strict):
    token: str = Field(max_length=256)
    account: Optional[NewAccount] = None


class PreferencesPatch(Strict):
    timezone: Optional[str] = Field(default=None, max_length=64)
    dateFormat: Optional[Literal["relative", "absolute"]] = None
    emailDigest: Optional[Literal["off", "daily", "weekly"]] = None
    compactTables: Optional[bool] = None


class ProfilePatch(Strict):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    jobTitle: Optional[str] = Field(default=None, max_length=80)
    avatarColor: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    preferences: Optional[PreferencesPatch] = None


class ChangePasswordIn(Strict):
    current: str = Field(max_length=256)
    next: str = Field(max_length=256)


class SwitchOrgIn(Strict):
    orgId: str = Field(max_length=64)


class DraftIn(BaseModel):
    step: int = Field(ge=0, le=10)
    draft: Dict[str, Any] = Field(default_factory=dict)


class OnboardingOrg(Strict):
    name: str = Field(min_length=2, max_length=120)
    size: str = Field(default="", max_length=40)
    industry: str = Field(default="", max_length=80)


class OnboardingInfra(Strict):
    dataCenterName: str = Field(min_length=1, max_length=80)
    environmentName: str = Field(default="Production", max_length=80)
    serverCount: int = Field(default=0, ge=0, le=100000)
    environmentType: Literal["cloud", "on-premises", "hybrid"] = "hybrid"


class InviteIn(Strict):
    email: EmailStr
    role: Role


class OnboardingIn(Strict):
    organization: OnboardingOrg
    infrastructure: OnboardingInfra
    monitoringMode: Literal["demo", "connect", "later"]
    invites: List[InviteIn] = Field(default_factory=list, max_length=20)


class OrgPatch(Strict):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    size: Optional[str] = Field(default=None, max_length=40)
    industry: Optional[str] = Field(default=None, max_length=80)
    environmentType: Optional[Literal["cloud", "on-premises", "hybrid"]] = None


class PlanIn(Strict):
    plan: Literal["trial", "team", "business"]


class RoleIn(Strict):
    role: Role


class ContactIn(Strict):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    company: str = Field(default="", max_length=120)
    subject: str = Field(min_length=2, max_length=60)
    message: str = Field(min_length=10, max_length=4000)


class ApiKeyIn(Strict):
    name: str = Field(min_length=2, max_length=60)
    scopes: List[Literal["metrics:write", "incidents:write", "read"]] = Field(min_length=1)

    @field_validator("scopes")
    @classmethod
    def unique(cls, v):
        return list(dict.fromkeys(v))
