from datetime import datetime
from typing import Any, Dict, List, Optional
from beanie import Document, Indexed
from pydantic import Field


class Server(Document):
    server_id: Indexed(str, unique=True)  # "<org_id>/<agent id>" for servers reported with an org API key
    org_id: Optional[str] = None  # set when ingested with an organization API key
    agent_id: Optional[str] = None  # the server_id the agent reported
    last_seen: Optional[datetime] = None
    hostname: str
    ip_address: str
    datacenter: str = "us-east-1"
    rack: str = "Rack-A"
    hardware_type: str = "compute"  # compute / storage / gpu / network
    status: str = "healthy"  # healthy / degraded / critical / offline
    thresholds: Dict[str, Any] = Field(
        default_factory=lambda: {
            "cpu_pct": 85.0,
            "ram_pct": 85.0,
            "temp_celsius": 80.0,
            "disk_used_pct": 90.0,
        }
    )
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "servers"
