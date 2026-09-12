from datetime import datetime
from typing import Optional
from beanie import Document
from pydantic import Field


class Alert(Document):
    server_id: str
    incident_id: Optional[str] = None
    severity: str = "medium"
    message: str
    anomaly_score: float = 0.0
    recommendation: str = ""
    acknowledged: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "alerts"
