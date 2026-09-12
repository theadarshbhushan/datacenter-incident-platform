from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field


class Incident(Document):
    incident_id: Indexed(str, unique=True)
    server_id: Indexed(str)
    hostname: str
    detected_at: Indexed(datetime) = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    severity: str = "medium"  # critical / high / medium / low
    incident_type: str = "anomaly"
    anomaly_score: float = 0.0
    model_used: str = "ensemble"
    shap_explanation: Optional[Dict[str, Any]] = None
    acknowledged: bool = False
    acknowledged_by: Optional[str] = None
    notes: str = ""
    status: str = "open"  # open / acknowledged / resolved
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "incidents"
