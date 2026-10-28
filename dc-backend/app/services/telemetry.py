"""
Telemetry ingestion: Validation -> Database (raw point + 5-minute rollup) -> trigger the ML pipeline
when a bucket completes. Also tracks per-organization ingestion health.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from loguru import logger

from app.core.timeutil import floor_to, iso, to_naive_utc, utcnow
from app.ml.features import BUCKET_SECONDS
from app.models.account import Organization
from app.models.monitoring import METRICS, DataCenter, IngestStats, Rack, Server, TelemetryBucket, TelemetryPoint

MAX_FUTURE = timedelta(minutes=5)
MAX_AGE = timedelta(hours=24)
BUCKET = timedelta(seconds=BUCKET_SECONDS)


class PointError(ValueError):
    pass


def check_timestamp(ts: Optional[datetime], now: datetime) -> datetime:
    if ts is None:
        return now
    ts = to_naive_utc(ts)
    if ts > now + MAX_FUTURE:
        raise PointError("timestamp is more than 5 minutes in the future (check the agent's clock)")
    if ts < now - MAX_AGE:
        raise PointError("timestamp is more than 24 hours old")
    return ts


async def _resolve_location(org_id: str, dc_name: Optional[str], rack_label: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Find or register the data center and rack an agent reports. Agents can only add, never move other rows."""
    if not dc_name and not rack_label:
        return None, None
    dc = await DataCenter.find_one({"org_id": org_id, "name": dc_name}) if dc_name else await DataCenter.find(DataCenter.org_id == org_id).sort("+created_at").first_or_none()
    if not dc:
        dc = DataCenter(org_id=org_id, name=dc_name or "Default data center", location="", environment="Production")
        await dc.insert()
    if not rack_label:
        return dc.id, None
    rack = await Rack.find_one({"org_id": org_id, "dc_id": dc.id, "label": rack_label})
    if not rack:
        rack = Rack(org_id=org_id, dc_id=dc.id, label=rack_label, row=rack_label[:1].upper(),
                    position=await Rack.find({"org_id": org_id, "dc_id": dc.id}).count() + 1)
        await rack.insert()
    return dc.id, rack.id


async def upsert_server(org_id: str, p, now: datetime) -> Server:
    s = await Server.find_one({"org_id": org_id, "agent_id": p.serverId})
    if not s:
        dc_id, rack_id = await _resolve_location(org_id, p.dataCenter, p.rack)
        s = Server(org_id=org_id, agent_id=p.serverId, hostname=p.hostname or p.serverId, ip=p.ip or "", role=p.role or "compute",
                   dc_id=dc_id, rack_id=rack_id, source="agent", first_seen=now)
        await s.insert()
        logger.info(f"Registered server {s.hostname} ({s.id}) for {org_id}")
    elif s.source == "agent":
        changed = False
        for attr, val in (("hostname", p.hostname), ("ip", p.ip), ("role", p.role)):
            if val and getattr(s, attr) != val:
                setattr(s, attr, val)
                changed = True
        if p.rack and not s.rack_id:
            s.dc_id, s.rack_id = await _resolve_location(org_id, p.dataCenter, p.rack)
            changed = True
        if changed:
            await s.save()
    return s


async def store_point(org_id: str, server: Server, ts: datetime, values: Dict[str, float], demo: bool = False) -> datetime:
    """Store the raw point and fold it into its 5-minute bucket. Returns the bucket start."""
    await TelemetryPoint(ts=ts, meta={"org_id": org_id, "server_id": server.id}, **values).insert()
    start = floor_to(ts, BUCKET_SECONDS)
    inc, mx = {}, {}
    for k, v in values.items():
        inc[f"sums.{k}"] = float(v)
        inc[f"counts.{k}"] = 1
        mx[f"maxes.{k}"] = float(v)
    await TelemetryBucket.get_motor_collection().update_one(
        {"org_id": org_id, "server_id": server.id, "start": start},
        {"$inc": inc, "$max": mx, "$setOnInsert": {"demo": demo}}, upsert=True,
    )
    return start


async def record_stats(org_id: str, accepted: int, rejected: int, error: str = "") -> None:
    now = utcnow()
    update = {"$inc": {"accepted": accepted, "rejected": rejected}}
    sets = {}
    if accepted:
        sets["last_received_at"] = now
    if error:
        sets["last_error"] = error[:300]
    if sets:
        update["$set"] = sets
    await IngestStats.get_motor_collection().update_one({"org_id": org_id, "hour": floor_to(now, 3600)}, update, upsert=True)


async def ingest(org: Organization, points: List, source: str = "agent") -> dict:
    """Validate and store a batch. Partial success: each rejected point is reported with its reason."""
    from app.services import demo as demo_svc
    from app.services import pipeline

    now = utcnow()
    accepted, rejected = 0, []
    touched: Dict[str, Server] = {}
    if points and await demo_svc.has_demo(org.id):
        await demo_svc.clear(org, actor="VaultWatch", reason="Real telemetry arrived, so the sample environment was removed.")
    for i, p in enumerate(points):
        try:
            ts = check_timestamp(p.timestamp, now)
            values = {k: v for k, v in p.metrics.model_dump().items() if v is not None and k in METRICS}
            if not values:
                raise PointError("no metric values")
            server = touched.get(p.serverId) or await upsert_server(org.id, p, now)
            await store_point(org.id, server, ts, values)
            if not server.last_seen or ts >= server.last_seen:
                server.last_seen = max(ts, server.last_seen or ts)
                for k, v in values.items():
                    setattr(server.latest, k, v)
                server.latest.at = ts
            touched[p.serverId] = server
            accepted += 1
        except PointError as e:
            rejected.append({"index": i, "serverId": getattr(p, "serverId", None), "error": str(e)})
    for s in touched.values():
        await s.save()
    await record_stats(org.id, accepted, len(rejected), rejected[-1]["error"] if rejected else "")
    if accepted and org.monitoring_mode != "connect":
        org.monitoring_mode = "connect"
        await org.save()
    scored = 0
    for s in touched.values():
        scored += await pipeline.score_if_bucket_closed(org.id, s)
    return {"accepted": accepted, "rejected": rejected, "servers": len(touched), "assessed": scored}


async def health(org_id: str) -> dict:
    """Connection health. 'live' only when real telemetry arrived in the last 5 minutes."""
    now = utcnow()
    rows = await IngestStats.find({"org_id": org_id, "hour": {"$gte": floor_to(now, 3600) - timedelta(hours=23)}}).to_list()
    last = max((r.last_received_at for r in rows if r.last_received_at), default=None)
    if last is None:
        newest = await IngestStats.find(IngestStats.org_id == org_id).sort("-hour").first_or_none()
        last = newest.last_received_at if newest else None
    reporting = await Server.find({"org_id": org_id, "demo": False, "last_seen": {"$gte": now - timedelta(minutes=5)}}).count()
    total = await Server.find({"org_id": org_id, "demo": False}).count()
    demo_servers = await Server.find({"org_id": org_id, "demo": True}).count()
    hour = next((r for r in rows if r.hour == floor_to(now, 3600)), None)
    if last and now - last <= timedelta(minutes=5):
        status = "live"
    elif last:
        status = "stale"
    elif demo_servers:
        status = "demo"
    else:
        status = "waiting"
    errors = sorted((r for r in rows if r.last_error), key=lambda r: r.hour)
    return {
        "status": status, "lastReceivedAt": iso(last),
        "serversReporting": reporting, "serversTotal": total, "demoServers": demo_servers,
        "acceptedLastHour": hour.accepted if hour else 0, "rejectedLastHour": hour.rejected if hour else 0,
        "accepted24h": sum(r.accepted for r in rows), "rejected24h": sum(r.rejected for r in rows),
        "lastError": errors[-1].last_error if errors else None,
    }
