from datetime import datetime
from pydantic import BaseModel, Field

class ServerCreate(BaseModel):
    name: str
    hostname: str
    ip_address: str
    cpu_cores: int = Field(..., gt=0)
    ram_gb: int = Field(..., gt=0)
    disk_gb: int = Field(..., gt=0)
    location: str

class ServerUpdate(BaseModel):
    name: str | None = None
    ip_address: str | None = None
    status: str | None = None
    cpu_cores: int | None = Field(None, gt=0)
    ram_gb: int | None = Field(None, gt=0)
    disk_gb: int | None = Field(None, gt=0)
    location: str | None = None

class ServerOut(BaseModel):
    id: str
    name: str
    hostname: str
    ip_address: str
    status: str
    cpu_cores: int
    ram_gb: int
    disk_gb: int
    location: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
