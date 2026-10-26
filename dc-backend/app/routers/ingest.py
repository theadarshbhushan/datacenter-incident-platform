"""
Metric ingestion for monitoring agents.

Authenticate with an organization API key (`X-API-Key: vw_live_...`, scope `metrics:write`). Servers
are stored per organization, so agents in different organizations can reuse the same server ids.
Internal pipeline services may instead send `X-Internal-Token` (INTERNAL_API_TOKEN).
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field

from app.core import ratelimit
from app.core.config import settings
from app.core.errors import ApiException
from app.core.tokens import hash_token, safe_equals
from app.models.account import ApiKey
from app.models.metric import Metric
from app.models.server import Server
from app.schemas.response import success_response
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/metrics", tags=["Ingestion"])


class MetricIn(BaseModel):
    server_id: str = Field(pattern=r"^[A-Za-z0-9._:-]{1,64}$")
    hostname: Optional[str] = Field(default=None, max_length=120)
    ip_address: Optional[str] = Field(default=None, max_length=64)
    rack: Optional[str] = Field(default=None, max_length=32)
    hardware_type: Optional[str] = Field(default=None, max_length=32)
    cpu_pct: float = Field(ge=0, le=100)
    ram_pct: float = Field(ge=0, le=100)
    disk_io_mbps: float = Field(default=0.0, ge=0)
    net_mbps: float = Field(default=0.0, ge=0)
    temp_celsius: float = Field(default=0.0, ge=-50, le=150)
    disk_used_pct: float = Field(default=0.0, ge=0, le=100)
    timestamp: Optional[datetime] = None


async def _api_key(request: Request, scope: str) -> Optional[ApiKey]:
    raw = request.headers.get("x-api-key") or ""
    auth = request.headers.get("authorization", "")
    if not raw and auth.lower().startswith("bearer vw_"):
        raw = auth[7:]
    if not raw:
        return None
    key = await ApiKey.find_one(ApiKey.key_hash == hash_token(raw.strip()))
    if not key:
        raise ApiException(401, "Invalid API key.", "invalid_api_key")
    if scope not in key.scopes:
        raise ApiException(403, f"This API key lacks the {scope} scope.", "forbidden")
    return key


@router.post("", status_code=status.HTTP_201_CREATED)
async def ingest_metric(body: MetricIn, request: Request):
    key = await _api_key(request, "metrics:write")
    internal = request.headers.get("x-internal-token", "")
    if not key and not (settings.INTERNAL_API_TOKEN and internal and safe_equals(internal, settings.INTERNAL_API_TOKEN)):
        raise ApiException(401, "Send an organization API key in the X-API-Key header.", "unauthenticated")
    now = datetime.utcnow()
    ts = body.timestamp.replace(tzinfo=None) if body.timestamp else now
    if ts > now + timedelta(minutes=5):
        ts = now
    org_id = key.org_id if key else None
    if key:
        ratelimit.hit(f"ingest:{key.id}", 1200, 60, "Ingestion rate limit exceeded for this API key.")
        if not key.last_used_at or now - key.last_used_at > timedelta(minutes=1):
            key.last_used_at = now
            await key.save()
    server_id = f"{org_id}/{body.server_id}" if org_id else body.server_id
    server = await Server.find_one(Server.server_id == server_id)
    if not server:
        server = Server(
            server_id=server_id, org_id=org_id, agent_id=body.server_id, hostname=body.hostname or body.server_id,
            ip_address=body.ip_address or "—", rack=body.rack or "A01", hardware_type=body.hardware_type or "compute",
        )
    for field in ("hostname", "ip_address", "rack", "hardware_type"):
        value = getattr(body, field)
        if value:
            setattr(server, field, value)
    server.last_seen = now
    await server.save()
    m = Metric(
        server_id=server_id, cpu_pct=body.cpu_pct, ram_pct=body.ram_pct, disk_io_mbps=body.disk_io_mbps, net_mbps=body.net_mbps,
        temp_celsius=body.temp_celsius, disk_used_pct=body.disk_used_pct, timestamp=ts,
    )
    await m.insert()
    data = {"server_id": body.server_id, "cpu_pct": m.cpu_pct, "ram_pct": m.ram_pct, "temp_celsius": m.temp_celsius,
            "disk_used_pct": m.disk_used_pct, "timestamp": ts.isoformat()}
    await ws_manager.broadcast({"type": "metric", "data": data}, org_id)
    return success_response(data, "Metric ingested")
