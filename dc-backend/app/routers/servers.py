from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, Field
from datetime import datetime
from loguru import logger

from app.models.server import Server
from app.models.metric import Metric
from app.models.user import User
from app.core.security import get_current_user
from app.schemas.response import success_response

router = APIRouter(prefix="/servers", tags=["Servers"])

DEFAULT_SERVERS = [
    {"server_id": "server-01", "hostname": "srv-core-01", "ip_address": "10.0.1.11", "datacenter": "us-east-1", "rack": "Rack-A", "hardware_type": "compute", "status": "healthy"},
    {"server_id": "server-02", "hostname": "srv-core-02", "ip_address": "10.0.1.12", "datacenter": "us-east-1", "rack": "Rack-A", "hardware_type": "compute", "status": "healthy"},
    {"server_id": "server-03", "hostname": "srv-app-alpha", "ip_address": "10.0.2.21", "datacenter": "us-east-1", "rack": "Rack-B", "hardware_type": "compute", "status": "critical"},
    {"server_id": "server-04", "hostname": "srv-app-beta", "ip_address": "10.0.2.22", "datacenter": "us-east-1", "rack": "Rack-B", "hardware_type": "compute", "status": "healthy"},
    {"server_id": "server-05", "hostname": "srv-cache-redis", "ip_address": "10.0.3.31", "datacenter": "us-east-1", "rack": "Rack-B", "hardware_type": "storage", "status": "healthy"},
    {"server_id": "server-06", "hostname": "srv-kafka-01", "ip_address": "10.0.4.41", "datacenter": "us-west-2", "rack": "Rack-C", "hardware_type": "network", "status": "healthy"},
    {"server_id": "server-07", "hostname": "srv-kafka-02", "ip_address": "10.0.4.42", "datacenter": "us-west-2", "rack": "Rack-C", "hardware_type": "network", "status": "degraded"},
    {"server_id": "server-08", "hostname": "srv-ml-inference", "ip_address": "10.0.5.51", "datacenter": "us-west-2", "rack": "Rack-C", "hardware_type": "gpu", "status": "healthy"},
    {"server_id": "server-09", "hostname": "srv-edge-proxy", "ip_address": "10.0.6.61", "datacenter": "us-east-1", "rack": "Rack-A", "hardware_type": "network", "status": "healthy"},
    {"server_id": "server-10", "hostname": "srv-storage-nas", "ip_address": "10.0.7.71", "datacenter": "us-west-2", "rack": "Rack-D", "hardware_type": "storage", "status": "healthy"},
]


async def ensure_seed_servers():
    count = await Server.count()
    if count == 0:
        logger.info("Seeding initial VaultWatch datacenter servers...")
        for s_data in DEFAULT_SERVERS:
            s = Server(**s_data)
            await s.insert()


class CreateServerRequest(BaseModel):
    server_id: str
    hostname: str
    ip_address: str
    datacenter: Optional[str] = "us-east-1"
    rack: Optional[str] = "Rack-A"
    hardware_type: Optional[str] = "compute"
    status: Optional[str] = "healthy"
    thresholds: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = Field(default_factory=list)


class UpdateServerRequest(BaseModel):
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    datacenter: Optional[str] = None
    rack: Optional[str] = None
    hardware_type: Optional[str] = None
    status: Optional[str] = None
    thresholds: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None


@router.get("")
async def get_servers(
    status: Optional[str] = Query(None, description="Filter by status: healthy/degraded/critical/offline"),
    datacenter: Optional[str] = Query(None, description="Filter by datacenter"),
    hardware_type: Optional[str] = Query(None, description="Filter by hardware type"),
):
    await ensure_seed_servers()

    query = {}
    if status:
        query["status"] = status
    if datacenter:
        query["datacenter"] = datacenter
    if hardware_type:
        query["hardware_type"] = hardware_type

    servers = await Server.find(query).to_list()

    # Enrich each server with its latest recorded metric
    enriched = []
    for s in servers:
        latest_metric = await Metric.find(Metric.server_id == s.server_id).sort(-Metric.timestamp).first_or_none()
        s_dict = s.dict()
        if latest_metric:
            s_dict["latest_metric"] = latest_metric.dict()
            s_dict["cpu_pct"] = latest_metric.cpu_pct
            s_dict["ram_pct"] = latest_metric.ram_pct
            s_dict["temp_celsius"] = latest_metric.temp_celsius
            s_dict["disk_used_pct"] = latest_metric.disk_used_pct
        else:
            # Baseline realistic values
            s_dict["cpu_pct"] = 45.0 if s.status != "critical" else 94.2
            s_dict["ram_pct"] = 52.0 if s.status != "critical" else 88.5
            s_dict["temp_celsius"] = 56.0 if s.status != "critical" else 84.1
            s_dict["disk_used_pct"] = 60.0

        enriched.append(s_dict)

    return success_response(data=enriched, message=f"Retrieved {len(enriched)} servers")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_server(payload: CreateServerRequest, current_user: User = Depends(get_current_user)):
    existing = await Server.find_one(Server.server_id == payload.server_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Server with ID '{payload.server_id}' already registered",
        )

    server = Server(
        server_id=payload.server_id,
        hostname=payload.hostname,
        ip_address=payload.ip_address,
        datacenter=payload.datacenter or "us-east-1",
        rack=payload.rack or "Rack-A",
        hardware_type=payload.hardware_type or "compute",
        status=payload.status or "healthy",
        thresholds=payload.thresholds or {
            "cpu_pct": 85.0,
            "ram_pct": 85.0,
            "temp_celsius": 80.0,
            "disk_used_pct": 90.0,
        },
        tags=payload.tags or [],
    )
    await server.insert()
    logger.info(f"Server {server.server_id} registered by {current_user.email}")
    return success_response(data=server.dict(), message=f"Server '{server.server_id}' created successfully")


@router.get("/{server_id}")
async def get_server(server_id: str):
    server = await Server.find_one(Server.server_id == server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")

    # Fetch last 60 metrics
    metrics = await Metric.find(Metric.server_id == server_id).sort(-Metric.timestamp).limit(60).to_list()
    metrics.reverse()

    return success_response(
        data={
            "server": server.dict(),
            "metrics": [m.dict() for m in metrics],
        },
        message=f"Server '{server_id}' and telemetry history retrieved",
    )


@router.put("/{server_id}")
async def update_server(server_id: str, payload: UpdateServerRequest, current_user: User = Depends(get_current_user)):
    server = await Server.find_one(Server.server_id == server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")

    update_data = payload.dict(exclude_unset=True)
    if update_data:
        await server.set(update_data)

    logger.info(f"Server {server_id} updated by {current_user.email}")
    return success_response(data=server.dict(), message=f"Server '{server_id}' updated successfully")


@router.delete("/{server_id}")
async def delete_server(server_id: str, current_user: User = Depends(get_current_user)):
    server = await Server.find_one(Server.server_id == server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")

    await server.delete()
    # Clean associated metrics
    await Metric.find(Metric.server_id == server_id).delete()
    logger.info(f"Server {server_id} deleted by {current_user.email}")
    return success_response(data={"server_id": server_id}, message=f"Server '{server_id}' deleted successfully")
