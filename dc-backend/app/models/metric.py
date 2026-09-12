from datetime import datetime
from beanie import Document, Indexed, TimeSeriesConfig, Granularity
from pydantic import Field


class Metric(Document):
    timestamp: Indexed(datetime) = Field(default_factory=datetime.utcnow)
    server_id: Indexed(str)
    cpu_pct: float
    ram_pct: float
    disk_io_mbps: float = 0.0
    net_mbps: float = 0.0
    temp_celsius: float = 0.0
    disk_used_pct: float = 0.0

    class Settings:
        name = "metrics"
        timeseries = TimeSeriesConfig(
            time_field="timestamp",
            meta_field="server_id",
            granularity="seconds",
        )
