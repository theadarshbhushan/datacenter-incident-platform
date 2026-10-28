"""Data centers, racks and servers: validation, derived health and the API shapes in dc-frontend/src/types/domain.ts."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional

from app.core.errors import ApiException, not_found
from app.core.timeutil import iso, utcnow
from app.models.monitoring import METRICS, DataCenter, Prediction, Rack, Server, TelemetryBucket, TelemetryPoint

STALE_AFTER = timedelta(minutes=5)      # connectivity "degraded"
OFFLINE_AFTER = timedelta(minutes=10)   # connectivity "offline"

# Static guard rails on top of the model: obvious saturation is unhealthy whatever the baseline says.
WARN = {"cpu": 85, "memory": 90, "storage": 85, "temperature": 75}
CRIT = {"cpu": 95, "memory": 95, "storage": 95, "temperature": 85}


def _round(v: Optional[float], nd: int = 0):
    if v is None:
        return None
    r = round(v, nd)
    return int(r) if nd == 0 else r


def connectivity(s: Server, now: Optional[datetime] = None) -> str:
    now = now or utcnow()
    if not s.last_seen or now - s.last_seen > OFFLINE_AFTER:
        return "offline"
    return "degraded" if now - s.last_seen > STALE_AFTER else "online"


def health(s: Server, now: Optional[datetime] = None) -> str:
    if connectivity(s, now) == "offline":
        return "offline"
    snap = s.latest
    values = {k: getattr(snap, k) for k in WARN}
    if s.assessment.severity == "critical" or any(v is not None and v >= CRIT[k] for k, v in values.items()):
        return "critical"
    if s.assessment.severity == "warning" or any(v is not None and v >= WARN[k] for k, v in values.items()):
        return "warning"
    return "healthy"


def server_public(s: Server, now: Optional[datetime] = None) -> dict:
    now = now or utcnow()
    snap = s.latest
    return {
        "id": s.id, "agentId": s.agent_id, "hostname": s.hostname, "rackId": s.rack_id or "", "dcId": s.dc_id or "", "slot": s.slot,
        "role": s.role, "ip": s.ip or "—", "model": s.model or "—",
        "cpu": _round(snap.cpu), "memory": _round(snap.memory), "storage": _round(snap.storage), "temperature": _round(snap.temperature),
        "powerW": _round(snap.power), "networkLatencyMs": _round(snap.latency, 1), "networkMbps": _round(snap.network, 1), "diskIoMbps": _round(snap.disk_io, 1),
        "connectivity": connectivity(s, now), "status": health(s, now),
        "uptimeDays": (now - s.first_seen).days if s.first_seen else 0,
        "lastSeenAt": iso(s.last_seen), "source": s.source, "sample": s.demo,
        "anomalyScore": s.assessment.anomaly_score, "assessment": s.assessment.severity, "assessedAt": iso(s.assessment.at),
    }


def worst(statuses: Iterable[str]) -> str:
    st = set(statuses)
    if "critical" in st:
        return "critical"
    if "warning" in st or "offline" in st:
        return "warning"
    return "healthy"


def rack_public(r: Rack, servers: List[dict]) -> dict:
    mine = [s for s in servers if s["rackId"] == r.id]
    power = [s["powerW"] for s in mine if s["powerW"] is not None]
    temps = [s["temperature"] for s in mine if s["temperature"] is not None]
    return {
        "id": r.id, "label": r.label, "dcId": r.dc_id, "row": r.row, "position": r.position,
        "powerKw": round(sum(power) / 1000, 1) if power else None, "powerCapacityKw": r.power_capacity_kw,
        # Inlet temperature is not measured by the agent; the hottest server reading is shown instead.
        "inletTemp": None, "maxTemp": max(temps) if temps else None,
        "status": worst(s["status"] for s in mine) if mine else "healthy", "sample": r.demo,
    }


def dc_public(d: DataCenter) -> dict:
    return {"id": d.id, "name": d.name, "location": d.location or "—", "environment": d.environment, "sample": d.demo}


async def inventory(org_id: str) -> dict:
    now = utcnow()
    dcs = await DataCenter.find(DataCenter.org_id == org_id).sort("+created_at").to_list()
    racks = await Rack.find(Rack.org_id == org_id).sort("+label").to_list()
    servers = [server_public(s, now) for s in await Server.find(Server.org_id == org_id).sort("+hostname").to_list()]
    return {"dataCenters": [dc_public(d) for d in dcs], "racks": [rack_public(r, servers) for r in racks], "servers": servers}


# ---------- lookups that enforce organization ownership ----------

async def get_dc(org_id: str, dc_id: str) -> DataCenter:
    d = await DataCenter.find_one({"_id": dc_id, "org_id": org_id})
    if not d:
        raise not_found("Data center not found.")
    return d


async def get_rack(org_id: str, rack_id: str) -> Rack:
    r = await Rack.find_one({"_id": rack_id, "org_id": org_id})
    if not r:
        raise not_found("Rack not found.")
    return r


async def get_server(org_id: str, server_id: str) -> Server:
    s = await Server.find_one({"_id": server_id, "org_id": org_id})
    if not s:
        raise not_found("Server not found.")
    return s


async def ensure_location(org_id: str, dc_id: Optional[str], rack_id: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Validate that the rack (and data center) belong to the organization; derive dc from rack."""
    if rack_id:
        rack = await get_rack(org_id, rack_id)
        if dc_id and dc_id != rack.dc_id:
            raise ApiException(400, "That rack belongs to a different data center.", "invalid_location")
        return rack.dc_id, rack.id
    if dc_id:
        await get_dc(org_id, dc_id)
    return dc_id, None


async def delete_server(org_id: str, server_id: str) -> None:
    s = await get_server(org_id, server_id)
    await TelemetryBucket.find({"org_id": org_id, "server_id": s.id}).delete()
    await TelemetryPoint.find({"meta.org_id": org_id, "meta.server_id": s.id}).delete()
    await Prediction.find({"org_id": org_id, "server_id": s.id}).delete()
    await s.delete()


async def delete_rack(org_id: str, rack_id: str) -> None:
    r = await get_rack(org_id, rack_id)
    if await Server.find({"org_id": org_id, "rack_id": r.id}).count():
        raise ApiException(409, "Move or delete the servers in this rack first.", "rack_not_empty")
    await r.delete()


async def delete_dc(org_id: str, dc_id: str) -> None:
    d = await get_dc(org_id, dc_id)
    if await Rack.find({"org_id": org_id, "dc_id": d.id}).count() or await Server.find({"org_id": org_id, "dc_id": d.id}).count():
        raise ApiException(409, "Delete or move the racks and servers in this data center first.", "dc_not_empty")
    await d.delete()


# ---------- metric history ----------

WINDOWS = {"1h": timedelta(hours=1), "6h": timedelta(hours=6), "24h": timedelta(hours=24), "7d": timedelta(days=7)}


async def bucket_series(org_id: str, server_ids: List[str], window: str, metrics: Iterable[str], until: Optional[datetime] = None) -> dict:
    """Bucket means (5-minute) for the servers, averaged across servers per bucket. Missing data stays null."""
    until = until or utcnow()
    since = until - WINDOWS[window]
    q = {"org_id": org_id, "start": {"$gte": since, "$lte": until}}
    if server_ids:
        q["server_id"] = {"$in": server_ids}
    rows = await TelemetryBucket.find(q).sort("+start").to_list()
    by_start: Dict[datetime, List[TelemetryBucket]] = {}
    for b in rows:
        by_start.setdefault(b.start, []).append(b)
    metrics = [m for m in metrics if m in METRICS]
    points = []
    for start, group in sorted(by_start.items()):
        p = {"at": iso(start)}
        for m in metrics:
            vals = [v for v in (b.mean(m) for b in group) if v is not None]
            p[m] = round(sum(vals) / len(vals), 2) if vals else None
        points.append(p)
    return {"window": window, "bucketSeconds": 300, "from": iso(since), "to": iso(until), "metrics": metrics,
            "servers": len(server_ids) if server_ids else len({b.server_id for b in rows}), "points": points}
