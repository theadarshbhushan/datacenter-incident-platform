"""
Infrastructure inventory, telemetry, ML predictions, alert rules and notifications.

MongoDB has no foreign keys, so references (org_id, dc_id, rack_id, server_id) are validated in the
service layer (app.services.infrastructure) and backed by compound indexes. Every document carries
org_id, and every query filters on it. `demo` marks rows created by the sample environment so they
can be shown with a label and removed without touching real data.

All timestamps are naive UTC datetimes (what pymongo returns by default).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

import pymongo
from beanie import Document, TimeSeriesConfig
from pydantic import BaseModel, Field

from app.models.account import new_id

METRICS = ("cpu", "memory", "storage", "disk_io", "network", "temperature", "power", "latency")


class DataCenter(Document):
    id: str = Field(default_factory=lambda: new_id("dc_"))
    org_id: str
    name: str
    location: str = ""
    environment: str = "Production"
    demo: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "data_centers"
        indexes = [pymongo.IndexModel([("org_id", 1), ("name", 1)])]


class Rack(Document):
    id: str = Field(default_factory=lambda: new_id("rack_"))
    org_id: str
    dc_id: str
    label: str
    row: str = ""
    position: int = 0
    power_capacity_kw: float = 8.0
    demo: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "racks"
        indexes = [pymongo.IndexModel([("org_id", 1), ("dc_id", 1), ("label", 1)], unique=True)]


class MetricSnapshot(BaseModel):
    at: Optional[datetime] = None
    cpu: Optional[float] = None
    memory: Optional[float] = None
    storage: Optional[float] = None
    disk_io: Optional[float] = None
    network: Optional[float] = None
    temperature: Optional[float] = None
    power: Optional[float] = None
    latency: Optional[float] = None


class Assessment(BaseModel):
    """Latest model output for a server, kept on the server so lists do not need a prediction lookup."""
    at: Optional[datetime] = None
    bucket: Optional[datetime] = None
    severity: str = "normal"          # normal / warning / critical / insufficient_data
    anomaly_score: Optional[float] = None
    primary_metric: Optional[str] = None
    model_version: Optional[str] = None


class Server(Document):
    id: str = Field(default_factory=lambda: new_id("srv_"))
    org_id: str
    agent_id: str                     # identifier the agent reports; unique within the organization
    hostname: str
    ip: str = ""
    dc_id: Optional[str] = None
    rack_id: Optional[str] = None
    slot: int = 0
    role: str = "compute"
    model: str = ""
    source: str = "agent"             # agent / manual / demo
    demo: bool = False
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    latest: MetricSnapshot = Field(default_factory=MetricSnapshot)
    assessment: Assessment = Field(default_factory=Assessment)
    last_scored_bucket: Optional[datetime] = None
    demo_status: Optional[str] = None  # demo servers only: status shown when no telemetry drives it
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "infra_servers"
        indexes = [
            pymongo.IndexModel([("org_id", 1), ("agent_id", 1)], unique=True),
            pymongo.IndexModel([("org_id", 1), ("rack_id", 1)]),
        ]


class TelemetryMeta(BaseModel):
    org_id: str
    server_id: str


class TelemetryPoint(Document):
    """Raw readings as received (time-series collection). Kept for audit and retention; charts and ML use buckets."""
    ts: datetime
    meta: TelemetryMeta
    received_at: datetime = Field(default_factory=datetime.utcnow)
    cpu: Optional[float] = None
    memory: Optional[float] = None
    storage: Optional[float] = None
    disk_io: Optional[float] = None
    network: Optional[float] = None
    temperature: Optional[float] = None
    power: Optional[float] = None
    latency: Optional[float] = None

    class Settings:
        name = "telemetry"
        timeseries = TimeSeriesConfig(time_field="ts", meta_field="meta", granularity="seconds", expire_after_seconds=90 * 86400)
        indexes = [pymongo.IndexModel([("meta.org_id", 1), ("meta.server_id", 1), ("ts", -1)])]


class TelemetryBucket(Document):
    """5-minute rollup per server: running sums and counts per metric. Inference and charts read these."""
    org_id: str
    server_id: str
    start: datetime
    demo: bool = False
    sums: Dict[str, float] = Field(default_factory=dict)
    counts: Dict[str, int] = Field(default_factory=dict)
    maxes: Dict[str, float] = Field(default_factory=dict)

    class Settings:
        name = "telemetry_buckets"
        indexes = [
            pymongo.IndexModel([("org_id", 1), ("server_id", 1), ("start", 1)], unique=True),
            pymongo.IndexModel([("org_id", 1), ("start", -1)]),
            pymongo.IndexModel([("start", 1)], expireAfterSeconds=90 * 86400),
        ]

    def mean(self, metric: str) -> Optional[float]:
        c = self.counts.get(metric, 0)
        return self.sums[metric] / c if c else None


class IngestStats(Document):
    """Hourly ingestion counters per organization, for connection health."""
    org_id: str
    hour: datetime
    accepted: int = 0
    rejected: int = 0
    last_received_at: Optional[datetime] = None
    last_error: str = ""

    class Settings:
        name = "ingest_stats"
        indexes = [pymongo.IndexModel([("org_id", 1), ("hour", -1)], unique=True),
                   pymongo.IndexModel([("hour", 1)], expireAfterSeconds=30 * 86400)]


class Factor(BaseModel):
    label: str
    metric: Optional[str] = None
    value: str = ""
    weight: float = 0.0


class Prediction(Document):
    id: str = Field(default_factory=lambda: new_id("pred_"))
    org_id: str
    server_id: str
    rack_id: Optional[str] = None
    dc_id: Optional[str] = None
    kind: str                          # anomaly (detects the present) / early_warning (forecasts the next hour)
    type: str                          # human label, e.g. "CPU anomaly"
    category: str                      # incident category it maps to
    metric: Optional[str] = None
    severity: str = "normal"           # normal / warning / critical
    anomaly_score: Optional[float] = None       # percentile of training scores, 0-1; NOT a probability
    risk_score: Optional[float] = None          # early warning model output, 0-1
    probability: Optional[float] = None         # only set when the model's calibration passed its test
    probability_calibrated: bool = False
    horizon: str = "now"               # now / 1h
    confidence: str = "low"            # low / medium / high (data coverage and validation of the metric)
    confidence_reason: str = ""
    factors: List[Factor] = Field(default_factory=list)
    details: List[Dict[str, Any]] = Field(default_factory=list)   # per metric: metric, anomalyScore, riskScore, current, median, level
    recommendation: str = ""
    model_version: str
    experimental: bool = False
    bucket_start: datetime             # telemetry time the prediction was computed for
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    expected_at: Optional[datetime] = None
    current: bool = True               # latest prediction of this kind for this server
    demo: bool = False

    class Settings:
        name = "predictions"
        indexes = [
            pymongo.IndexModel([("org_id", 1), ("current", 1), ("generated_at", -1)]),
            pymongo.IndexModel([("org_id", 1), ("server_id", 1), ("kind", 1), ("generated_at", -1)]),
            pymongo.IndexModel([("generated_at", 1)], expireAfterSeconds=90 * 86400),
        ]


class ModelRecord(Document):
    """Metadata of every model version the API has loaded."""
    id: str                            # model version
    trained_at: str
    first_loaded_at: datetime = Field(default_factory=datetime.utcnow)
    last_loaded_at: datetime = Field(default_factory=datetime.utcnow)
    artifact_sha256: str = ""
    summary: Dict[str, Any] = Field(default_factory=dict)

    class Settings:
        name = "ml_models"


class AlertRule(Document):
    id: str = Field(default_factory=lambda: new_id("rule_"))
    org_id: str
    name: str
    metric: str                        # cpu / memory / temperature / power / latency / storage
    operator: str                      # > or <
    threshold: float
    duration_min: int = 5
    severity: str = "warning"          # critical / warning / info
    enabled: bool = True
    channels: List[str] = Field(default_factory=list)
    position: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "alert_rules"
        indexes = [pymongo.IndexModel([("org_id", 1), ("position", 1)])]


class Notification(Document):
    """Delivery log: one row per alert and channel, with what actually happened."""
    org_id: str
    alert_id: str
    channel: str                       # email / slack / webhook / pagerduty
    status: str                        # sent / failed / not_configured / logged_only / suppressed
    detail: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "notifications"
        indexes = [pymongo.IndexModel([("org_id", 1), ("created_at", -1)]),
                   pymongo.IndexModel([("created_at", 1)], expireAfterSeconds=90 * 86400)]


class Counter(Document):
    """Atomic per-organization sequences (incident numbers)."""
    id: str
    value: int = 0

    class Settings:
        name = "counters"


class SchemaMigration(Document):
    id: str                            # migration name
    applied_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "schema_migrations"


MONITORING_MODELS = [DataCenter, Rack, Server, TelemetryPoint, TelemetryBucket, IngestStats, Prediction, ModelRecord,
                     AlertRule, Notification, Counter, SchemaMigration]
