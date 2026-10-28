"""Request schemas for telemetry ingestion, infrastructure management and predictions."""
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

AGENT_ID = r"^[A-Za-z0-9._:-]{1,64}$"


class MetricValues(BaseModel):
    """All optional; at least one is required per point. Units are fixed so the model sees consistent data."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    cpu: Optional[float] = Field(default=None, ge=0, le=100, description="CPU utilization, percent")
    memory: Optional[float] = Field(default=None, ge=0, le=100, description="Memory utilization, percent")
    storage: Optional[float] = Field(default=None, ge=0, le=100, description="Disk space used, percent")
    disk_io: Optional[float] = Field(default=None, ge=0, le=100000, alias="diskIo", description="Disk throughput, MB/s")
    network: Optional[float] = Field(default=None, ge=0, le=1000000, description="Network throughput, Mb/s")
    temperature: Optional[float] = Field(default=None, ge=-20, le=130, description="Server temperature, degrees Celsius")
    power: Optional[float] = Field(default=None, ge=0, le=20000, description="Power draw, watts")
    latency: Optional[float] = Field(default=None, ge=0, le=60000, description="Network latency, milliseconds")


class TelemetryPointIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    serverId: str = Field(pattern=AGENT_ID, description="Stable identifier of the server, chosen by the agent")
    timestamp: Optional[datetime] = Field(default=None, description="ISO-8601 with a timezone. Defaults to the time received.")
    hostname: Optional[str] = Field(default=None, max_length=120)
    ip: Optional[str] = Field(default=None, max_length=64)
    rack: Optional[str] = Field(default=None, max_length=32, description="Rack label; registered on first use")
    dataCenter: Optional[str] = Field(default=None, max_length=80, description="Data center name; registered on first use")
    role: Optional[str] = Field(default=None, max_length=40)
    metrics: MetricValues

    @model_validator(mode="after")
    def tz_required(self):
        if self.timestamp is not None and self.timestamp.tzinfo is None:
            raise ValueError("timestamp must include a timezone, for example 2026-10-26T12:00:00Z")
        return self


class TelemetryBatchIn(BaseModel):
    points: List[TelemetryPointIn] = Field(min_length=1, max_length=500)


class LegacyMetricIn(BaseModel):
    """The earlier single-point format of POST /metrics, kept for existing agents."""
    server_id: str = Field(pattern=AGENT_ID)
    hostname: Optional[str] = Field(default=None, max_length=120)
    ip_address: Optional[str] = Field(default=None, max_length=64)
    rack: Optional[str] = Field(default=None, max_length=32)
    hardware_type: Optional[str] = Field(default=None, max_length=32)
    cpu_pct: float = Field(ge=0, le=100)
    ram_pct: float = Field(ge=0, le=100)
    disk_io_mbps: float = Field(default=0.0, ge=0)
    net_mbps: float = Field(default=0.0, ge=0)
    temp_celsius: Optional[float] = Field(default=None, ge=-20, le=130)
    disk_used_pct: Optional[float] = Field(default=None, ge=0, le=100)
    timestamp: Optional[datetime] = None

    def to_point(self) -> TelemetryPointIn:
        ts = self.timestamp
        if ts is not None and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)  # the old format documented UTC without an offset
        return TelemetryPointIn(
            serverId=self.server_id, timestamp=ts, hostname=self.hostname, ip=self.ip_address, rack=self.rack, role=self.hardware_type,
            metrics=MetricValues(cpu=self.cpu_pct, memory=self.ram_pct, disk_io=self.disk_io_mbps, network=self.net_mbps,
                                 temperature=self.temp_celsius, storage=self.disk_used_pct),
        )


class DataCenterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    location: str = Field(default="", max_length=120)
    environment: str = Field(default="Production", max_length=40)


class DataCenterPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    location: Optional[str] = Field(default=None, max_length=120)
    environment: Optional[str] = Field(default=None, max_length=40)


class RackIn(BaseModel):
    dcId: str = Field(max_length=64)
    label: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")
    row: str = Field(default="", max_length=8)
    position: int = Field(default=0, ge=0, le=10000)
    powerCapacityKw: float = Field(default=8.0, gt=0, le=1000)


class RackPatch(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")
    row: Optional[str] = Field(default=None, max_length=8)
    position: Optional[int] = Field(default=None, ge=0, le=10000)
    powerCapacityKw: Optional[float] = Field(default=None, gt=0, le=1000)


class ServerIn(BaseModel):
    agentId: str = Field(pattern=AGENT_ID, description="Must match the serverId the agent will report")
    hostname: str = Field(min_length=1, max_length=120)
    ip: str = Field(default="", max_length=64)
    rackId: Optional[str] = Field(default=None, max_length=64)
    dcId: Optional[str] = Field(default=None, max_length=64)
    slot: int = Field(default=0, ge=0, le=100)
    role: str = Field(default="compute", max_length=40)
    model: str = Field(default="", max_length=80)


class ServerPatch(BaseModel):
    hostname: Optional[str] = Field(default=None, min_length=1, max_length=120)
    ip: Optional[str] = Field(default=None, max_length=64)
    rackId: Optional[str] = Field(default=None, max_length=64)
    dcId: Optional[str] = Field(default=None, max_length=64)
    slot: Optional[int] = Field(default=None, ge=0, le=100)
    role: Optional[str] = Field(default=None, max_length=40)
    model: Optional[str] = Field(default=None, max_length=80)


class PredictionRunIn(BaseModel):
    serverIds: List[str] = Field(default_factory=list, max_length=500)
