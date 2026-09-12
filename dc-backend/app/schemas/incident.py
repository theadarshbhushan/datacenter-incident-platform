from datetime import datetime
from pydantic import BaseModel
from app.models.incident import IncidentSeverity, IncidentType

class IncidentCreate(BaseModel):
    server_id: str
    severity: IncidentSeverity
    incident_type: IncidentType
    anomaly_score: float
    model_used: str
    notes: str = ""

class IncidentUpdate(BaseModel):
    acknowledged: bool | None = None
    notes: str | None = None
    resolved: bool | None = None

class IncidentOut(BaseModel):
    id: str
    server_id: str
    detected_at: datetime
    resolved_at: datetime | None
    severity: IncidentSeverity
    incident_type: IncidentType
    anomaly_score: float
    model_used: str
    acknowledged: bool
    notes: str

    model_config = {
        "from_attributes": True
    }
