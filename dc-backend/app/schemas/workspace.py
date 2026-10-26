from typing import List, Literal, Optional, Union

from pydantic import BaseModel, Field

Severity = Literal["critical", "major", "minor"]
Category = Literal["thermal", "power", "network", "hardware", "storage", "software", "capacity"]
AlertSeverity = Literal["critical", "warning", "info"]


class NewIncidentIn(BaseModel):
    title: str = Field(min_length=5, max_length=140)
    description: str = Field(default="", max_length=4000)
    severity: Severity
    category: Category
    rackId: str = Field(default="", max_length=64)
    serverIds: List[str] = Field(default_factory=list, max_length=50)
    assigneeId: Optional[str] = Field(default=None, max_length=64)


class AckAction(BaseModel):
    type: Literal["acknowledge"]


class AssignAction(BaseModel):
    type: Literal["assign"]
    userId: Optional[str] = Field(default=None, max_length=64)


class StatusAction(BaseModel):
    type: Literal["status"]
    status: Literal["ongoing", "investigating", "resolved"]


class ResolveAction(BaseModel):
    type: Literal["resolve"]
    note: Optional[str] = Field(default=None, max_length=2000)


class ReopenAction(BaseModel):
    type: Literal["reopen"]
    reason: Optional[str] = Field(default=None, max_length=2000)


class CommentAction(BaseModel):
    type: Literal["comment"]
    message: str = Field(min_length=1, max_length=4000)


IncidentAction = Union[AckAction, AssignAction, StatusAction, ResolveAction, ReopenAction, CommentAction]


class AlertActionIn(BaseModel):
    type: Literal["acknowledge", "dismiss"]


class AlertRuleIn(BaseModel):
    id: str = Field(default="", max_length=64)
    name: str = Field(min_length=2, max_length=60)
    metric: Literal["cpu", "memory", "temperature", "power", "latency", "storage"]
    operator: Literal[">", "<"]
    threshold: float = Field(ge=0, le=100000)
    durationMin: int = Field(ge=1, le=1440)
    severity: AlertSeverity
    enabled: bool = True
    channels: List[Literal["email", "slack", "webhook", "pagerduty"]] = Field(default_factory=list)


class NotificationSettingsIn(BaseModel):
    email: bool
    slack: bool
    webhook: bool
    pagerduty: bool
    slackChannel: str = Field(default="", max_length=80)
    webhookUrl: str = Field(default="", max_length=500, pattern=r"^(https://\S+)?$")
    quietHours: bool
    minSeverity: AlertSeverity


class MonitoringIn(BaseModel):
    scrapeIntervalSec: int = Field(ge=5, le=3600)
    retentionDays: int = Field(ge=1, le=3650)
    anomalySensitivity: Literal["low", "medium", "high"]
    predictionHorizon: Literal["6h", "24h", "72h", "7d"]
    autoCreateIncidents: bool
