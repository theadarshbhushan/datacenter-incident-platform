from datetime import datetime
from beanie import Document, Granularity, TimeSeriesConfig
from pymongo import ASCENDING

class Metric(Document):
    timestamp: datetime
    server_id: str
    cpu_pct: float
    ram_pct: float
    disk_io_mbps: float
    net_mbps: float
    temp_celsius: float
    disk_used_pct: float

    class Settings:
        name = "metrics"
        timeseries = TimeSeriesConfig(
            time_field="timestamp",
            meta_field="server_id",
            granularity=Granularity.seconds,
        )
        indexes = [
            [("server_id", ASCENDING), ("timestamp", ASCENDING)],
        ]
