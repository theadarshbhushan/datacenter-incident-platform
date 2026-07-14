from datetime import datetime, timezone
from enum import Enum
from beanie import Document
from pydantic import Field

class IncidentSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class IncidentType(str, Enum):
    CPU_SPIKE = "cpu_spike"
    MEMORY_LEAK = "memory_leak"
    DISK_FAILURE = "disk_failure"
    NETWORK_ANOMALY = "network_anomaly"
    THERMAL_EVENT = "thermal_event"
    PREDICTED_OUTAGE = "predicted_outage"

class Incident(Document):
    server_id: str
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: datetime | None = None
    severity: IncidentSeverity
    incident_type: IncidentType
    anomaly_score: float
    model_used: str
    acknowledged: bool = False
    notes: str = ""

    class Settings:
        name = "incidents"
        indexes = [
            "server_id",
            "severity",
            "incident_type",
            "detected_at",
            "acknowledged",
        ]
