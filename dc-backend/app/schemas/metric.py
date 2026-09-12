from datetime import datetime
from pydantic import BaseModel, Field

class MetricCreate(BaseModel):
    server_id: str
    cpu_pct: float = Field(..., ge=0.0, le=100.0)
    ram_pct: float = Field(..., ge=0.0, le=100.0)
    disk_io_mbps: float = Field(..., ge=0.0)
    net_mbps: float = Field(..., ge=0.0)
    temp_celsius: float
    disk_used_pct: float = Field(..., ge=0.0, le=100.0)
    timestamp: datetime | None = None

class MetricOut(BaseModel):
    id: str
    server_id: str
    cpu_pct: float
    ram_pct: float
    disk_io_mbps: float
    net_mbps: float
    temp_celsius: float
    disk_used_pct: float
    timestamp: datetime

    model_config = {
        "from_attributes": True
    }
