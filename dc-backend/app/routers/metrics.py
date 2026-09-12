from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from loguru import logger

from app.models.metric import Metric
from app.models.server import Server
from app.websocket.manager import ws_manager
from app.schemas.response import success_response

router = APIRouter(prefix="/metrics", tags=["Metrics"])


class CreateMetricRequest(BaseModel):
    server_id: str
    cpu_pct: float
    ram_pct: float
    disk_io_mbps: Optional[float] = 0.0
    net_mbps: Optional[float] = 0.0
    temp_celsius: Optional[float] = 0.0
    disk_used_pct: Optional[float] = 0.0
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)


@router.get("")
async def get_metrics(
    server_id: Optional[str] = Query(None, description="Server ID filter"),
    hours: int = Query(1, ge=1, le=720, description="Window in hours"),
    limit: int = Query(100, ge=1, le=5000, description="Max results"),
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    query = {"timestamp": {"$gte": cutoff}}
    if server_id:
        query["server_id"] = server_id

    metrics = await Metric.find(query).sort(-Metric.timestamp).limit(limit).to_list()
    metrics.reverse()

    return success_response(
        data=[m.dict() for m in metrics],
        message=f"Retrieved {len(metrics)} metric records",
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_metric(payload: CreateMetricRequest):
    m = Metric(
        server_id=payload.server_id,
        cpu_pct=payload.cpu_pct,
        ram_pct=payload.ram_pct,
        disk_io_mbps=payload.disk_io_mbps or 0.0,
        net_mbps=payload.net_mbps or 0.0,
        temp_celsius=payload.temp_celsius or 0.0,
        disk_used_pct=payload.disk_used_pct or 0.0,
        timestamp=payload.timestamp or datetime.utcnow(),
    )
    await m.insert()

    # Broadcast over WebSocket for real-time dashboards
    metric_dict = m.dict()
    metric_dict["timestamp"] = m.timestamp.isoformat()
    await ws_manager.broadcast({"type": "metric", "data": metric_dict})

    return success_response(data=metric_dict, message="Metric ingested successfully")


@router.get("/aggregate/summary")
async def get_aggregate_summary():
    """Fleet-wide averages: avg_cpu, avg_ram, avg_temp per server"""
    servers = await Server.find_all().to_list()
    summary = []

    for s in servers:
        recent = await Metric.find(Metric.server_id == s.server_id).sort(-Metric.timestamp).limit(30).to_list()
        if recent:
            avg_cpu = sum(m.cpu_pct for m in recent) / len(recent)
            avg_ram = sum(m.ram_pct for m in recent) / len(recent)
            avg_temp = sum(m.temp_celsius for m in recent) / len(recent)
        else:
            avg_cpu = 45.0 if s.status != "critical" else 94.2
            avg_ram = 55.0 if s.status != "critical" else 88.5
            avg_temp = 58.0 if s.status != "critical" else 84.1

        summary.append({
            "server_id": s.server_id,
            "hostname": s.hostname,
            "rack": s.rack,
            "status": s.status,
            "avg_cpu": round(avg_cpu, 2),
            "avg_ram": round(avg_ram, 2),
            "avg_temp": round(avg_temp, 2),
        })

    return success_response(data=summary, message="Fleet metrics summary calculated")


@router.get("/{server_id}/latest")
async def get_latest_metric(server_id: str):
    metric = await Metric.find(Metric.server_id == server_id).sort(-Metric.timestamp).first_or_none()
    if not metric:
        # Generate nominal metric
        return success_response(
            data={
                "server_id": server_id,
                "cpu_pct": 42.5,
                "ram_pct": 58.0,
                "disk_io_mbps": 45.0,
                "net_mbps": 120.0,
                "temp_celsius": 52.0,
                "disk_used_pct": 60.0,
                "timestamp": datetime.utcnow().isoformat(),
            },
            message="Generated baseline metric",
        )

    m_dict = metric.dict()
    m_dict["timestamp"] = metric.timestamp.isoformat()
    return success_response(data=m_dict, message=f"Latest metric for '{server_id}'")


@router.get("/{server_id}/history")
async def get_server_history(
    server_id: str,
    hours: int = Query(24, ge=1, le=168, description="History window in hours"),
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    metrics = await Metric.find(
        Metric.server_id == server_id,
        Metric.timestamp >= cutoff,
    ).sort(-Metric.timestamp).limit(500).to_list()
    metrics.reverse()

    return success_response(
        data=[m.dict() for m in metrics],
        message=f"Historical telemetry for '{server_id}' ({len(metrics)} points)",
    )
