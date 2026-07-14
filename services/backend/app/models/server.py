from datetime import datetime, timezone
from beanie import Document
from pydantic import Field

class Server(Document):
    name: str
    hostname: str = Field(unique=True)
    ip_address: str
    status: str = "active"  # active, maintenance, offline, anomalous
    cpu_cores: int
    ram_gb: int
    disk_gb: int
    location: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "servers"
        indexes = [
            "hostname",
            "status",
        ]
