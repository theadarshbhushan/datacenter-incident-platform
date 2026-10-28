"""
Demo mode: a clearly labeled sample environment for organizations without real infrastructure.

- Inventory (2 data centers, 10 racks, 40 servers) and resolved incident history come from
  app.services.sample_data.
- Telemetry is synthetic: daily cycles plus noise, with a few injected problems (a hot, CPU-saturated
  server, memory growth on a broker, a warm rack, one host that stops reporting).
- Predictions, alerts and active incidents are produced by the *real* model and pipeline running on that
  synthetic telemetry. Every row carries demo=True and the UI labels it as sample data.
- New synthetic buckets are added lazily (top_up) when a demo workspace is opened, so the demo stays current
  without a background worker.
- Demo rows are never mixed with real data: the first real telemetry removes them (see services.telemetry).
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import numpy as np

from app.core.config import settings
from app.core.timeutil import floor_to, utcnow
from app.ml.features import BUCKET_SECONDS
from app.models.account import Organization, WorkspaceAlert, WorkspaceIncident
from app.models.monitoring import DataCenter, Prediction, Rack, Server, TelemetryBucket
from app.services import sample_data as sd

BUCKET = timedelta(seconds=BUCKET_SECONDS)
OFFLINE_HOST = "srv-c02-4"
# demo server -> target values of injected problems, and how many minutes before load time they start
HOTSPOTS = {
    "srv-a02-3": {"onset": 25, "cpu": 94, "temperature": 82},
    "srv-b01-2": {"onset": 30, "memory": 92},
    "srv-a03-1": {"onset": 25, "temperature": 76},
    "srv-a03-2": {"onset": 20, "temperature": 74},
    "srv-a03-3": {"onset": 30, "temperature": 73},
}
_locks: Dict[str, asyncio.Lock] = {}


def _profile(key: str, base: dict) -> dict:
    rng = np.random.default_rng(sum(ord(c) * (i + 1) for i, c in enumerate(key)))  # stable across runs
    # sample_data's hot spots describe the *current* reading; their normal level comes from the defaults here.
    normal = {"cpu": 42.0, "memory": 58.0} if key in sd._HOTSPOTS else base
    return {
        "cpu": float(normal["cpu"]), "memory": float(normal["memory"]), "storage": float(base["storage"]),
        "network": float(rng.uniform(60, 420)), "disk_io": float(rng.uniform(5, 60)), "latency": float(base["networkLatencyMs"]),
        "phase": float(rng.uniform(0, 2 * math.pi)), "seed": int(rng.integers(0, 2**31)),
    }


def _value(p: dict, metric: str, t: datetime, rng: np.random.Generator, hot: Optional[dict], seed_time: datetime) -> float:
    day = 2 * math.pi * ((t.hour * 60 + t.minute) / 1440.0) + p["phase"]
    cpu = p["cpu"] + 9 * math.sin(day) + rng.normal(0, 2.5)
    if hot and "cpu" in hot:
        cpu = _ramp(cpu, hot["cpu"] + rng.normal(0, 2.5), t, seed_time, hot["onset"])
    cpu = min(100, max(1, cpu))
    if metric == "cpu":
        return cpu
    if metric == "memory":
        v = p["memory"] + 2 * math.sin(day / 2) + rng.normal(0, 0.8)
        if hot and "memory" in hot:
            v = _ramp(v, hot["memory"] + rng.normal(0, 1.0), t, seed_time, hot["onset"])
        return min(100, max(1, v))
    if metric == "storage":
        return min(100, max(1, p["storage"] + rng.normal(0, 0.2)))
    if metric == "temperature":
        v = 30 + 0.22 * cpu + rng.normal(0, 0.7)
        if hot and "temperature" in hot:
            v = _ramp(v, hot["temperature"] + rng.normal(0, 1.5), t, seed_time, hot["onset"])
        return v
    if metric == "power":
        return 260 + 4.2 * cpu + rng.normal(0, 8)
    if metric == "network":
        return max(1, p["network"] * (1 + 0.35 * math.sin(day)) + rng.normal(0, p["network"] * 0.05))
    if metric == "disk_io":
        return max(0.1, p["disk_io"] * (1 + 0.3 * math.sin(day + 1)) + rng.normal(0, p["disk_io"] * 0.08))
    if metric == "latency":
        return max(0.05, p["latency"] + rng.normal(0, 0.08))
    raise ValueError(metric)


def _ramp(normal: float, target: float, t: datetime, seed_time: datetime, onset_min: int) -> float:
    """From the onset, move towards `target` over 15 minutes and stay there (with a little noise)."""
    start = seed_time - timedelta(minutes=onset_min)
    if t < start:
        return normal
    k = min(1.0, (t - start).total_seconds() / 900)
    return normal + (target - normal) * k


METRIC_KEYS = ("cpu", "memory", "storage", "temperature", "power", "network", "disk_io", "latency")


def _buckets_for(org_id: str, server: Server, key: str, base: dict, starts: List[datetime], seed_time: datetime) -> List[TelemetryBucket]:
    p = _profile(key, base)
    hot = HOTSPOTS.get(key)
    out = []
    for start in starts:
        rng = np.random.default_rng(p["seed"] + int(start.timestamp()) // BUCKET_SECONDS)
        vals = {m: float(_value(p, m, start, rng, hot, seed_time)) for m in METRIC_KEYS}
        out.append(TelemetryBucket(org_id=org_id, server_id=server.id, start=start, demo=True,
                                   sums={m: round(v, 3) for m, v in vals.items()}, counts={m: 1 for m in vals}, maxes={m: round(v, 3) for m, v in vals.items()}))
    return out


async def has_demo(org_id: str) -> bool:
    return await Server.find_one({"org_id": org_id, "demo": True}) is not None or await DataCenter.find_one({"org_id": org_id, "demo": True}) is not None


async def clear(org: Organization, actor: str, reason: str = "") -> None:
    from app.services.accounts import audit

    q = {"org_id": org.id, "demo": True}
    for model in (DataCenter, Rack, Server, TelemetryBucket, Prediction, WorkspaceIncident, WorkspaceAlert):
        await model.find(q).delete()
    if org.monitoring_mode == "demo":
        org.monitoring_mode = "later"
        await org.save()
    await audit(org.id, actor, reason or "Removed the sample environment")


async def seed(org: Organization, owner_name: str, dc_name: Optional[str] = None, env_name: Optional[str] = None,
               assignees: Optional[List[str]] = None) -> None:
    """Create the sample environment. Refuses if the organization already has real servers."""
    from app.core.errors import ApiException
    from app.services import pipeline

    if await Server.find_one({"org_id": org.id, "demo": False}):
        raise ApiException(409, "This organization already has real servers. Sample data is only available in an organization without real infrastructure.", "has_real_servers")
    if await has_demo(org.id):
        await clear(org, owner_name, "Reloaded the sample environment")
    now = utcnow()
    seed_time = floor_to(now, BUCKET_SECONDS)
    racks_raw, servers_raw = sd.build_infrastructure()
    dc_map, rack_map, server_map = {}, {}, {}
    for i, d in enumerate(sd.DEMO_DATA_CENTERS):
        dc = DataCenter(org_id=org.id, name=(dc_name if i == 0 and dc_name else d["name"]), location=d["location"],
                        environment=(env_name if i == 0 and env_name else d["environment"]), demo=True)
        await dc.insert()
        dc_map[d["id"]] = dc.id
    for r in racks_raw:
        rack = Rack(org_id=org.id, dc_id=dc_map[r["dcId"]], label=r["label"], row=r["row"], position=r["position"],
                    power_capacity_kw=r["powerCapacityKw"], demo=True)
        await rack.insert()
        rack_map[r["id"]] = rack.id
    starts = [seed_time - BUCKET * i for i in range(max(5, settings.DEMO_SEED_HOURS) * 12, 0, -1)]
    buckets: List[TelemetryBucket] = []
    servers: List[Server] = []
    for s in servers_raw:
        key = s["id"]
        offline = key == OFFLINE_HOST
        srv = Server(org_id=org.id, agent_id=f"demo-{key}", hostname=s["hostname"], ip=s["ip"], dc_id=dc_map[s["dcId"]], rack_id=rack_map[s["rackId"]],
                     slot=s["slot"], role=s["role"], model=s["model"], source="demo", demo=True,
                     first_seen=now - timedelta(days=s["uptimeDays"]))
        my_starts = starts[:-24] if offline else starts           # the offline host stopped reporting two hours ago
        srv.last_seen = my_starts[-1] + BUCKET
        await srv.insert()
        server_map[key] = srv
        servers.append(srv)
        buckets.extend(_buckets_for(org.id, srv, key, s, my_starts, seed_time))
    for i in range(0, len(buckets), 2000):
        await TelemetryBucket.insert_many(buckets[i:i + 2000])
    for srv in servers:
        _set_latest(srv, [b for b in buckets if b.server_id == srv.id][-1])
        await srv.save()

    # Resolved history (sample text, labeled) plus one active "host unreachable" incident.
    history = [i for i in sd.build_incidents(servers_raw, sd.now_ms(), owner_name) if i["status"] == "resolved" or i["category"] == "power"]
    docs = []
    for i, inc in enumerate(history):
        inc["serverIds"] = [server_map[s].id for s in inc["serverIds"]]
        inc["rackId"], inc["dcId"] = rack_map[inc["rackId"]], dc_map[inc["dcId"]]
        inc["sample"] = True
        if assignees:
            inc["assigneeId"] = assignees[i % len(assignees)]
        docs.append(WorkspaceIncident(org_id=org.id, incident_id=inc["id"], created_at=_parse(inc["createdAt"]), data=inc, demo=True).sync())
    if docs:
        await WorkspaceIncident.insert_many(docs)
    # Run the real pipeline on the synthetic telemetry: predictions, alerts and active incidents.
    for srv in servers:
        if srv.agent_id != f"demo-{OFFLINE_HOST}":
            await pipeline.score_server(org.id, srv, seed_time - BUCKET, demo=True)


def _set_latest(srv: Server, b: TelemetryBucket) -> None:
    for m in METRIC_KEYS:
        setattr(srv.latest, m, b.mean(m))
    srv.latest.at = b.start + BUCKET


def _parse(ts: str) -> datetime:
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")


async def top_up(org_id: str) -> int:
    """Append synthetic buckets up to now for demo servers and score them. Returns buckets added."""
    lock = _locks.setdefault(org_id, asyncio.Lock())
    if lock.locked():
        return 0
    async with lock:
        from app.services import pipeline

        servers = await Server.find({"org_id": org_id, "demo": True}).to_list()
        if not servers:
            return 0
        now_bucket = floor_to(utcnow(), BUCKET_SECONDS)
        racks_raw, servers_raw = sd.build_infrastructure()
        base_by_host = {s["hostname"]: s for s in servers_raw}
        added = 0
        for srv in servers:
            key = srv.agent_id.removeprefix("demo-")
            if key == OFFLINE_HOST or not srv.last_seen:
                continue
            last = srv.last_seen - BUCKET
            starts = []
            t = last + BUCKET
            while t < now_bucket and len(starts) < 288:
                starts.append(t)
                t += BUCKET
            if not starts:
                continue
            # Injected problems stay anchored to when the sample was loaded.
            new = _buckets_for(org_id, srv, key, base_by_host.get(srv.hostname, servers_raw[0]), starts, floor_to(srv.created_at, BUCKET_SECONDS))
            await TelemetryBucket.insert_many(new)
            added += len(new)
            _set_latest(srv, new[-1])
            srv.last_seen = new[-1].start + BUCKET
            await srv.save()
            await pipeline.score_server(org_id, srv, new[-1].start, demo=True)
        return added
