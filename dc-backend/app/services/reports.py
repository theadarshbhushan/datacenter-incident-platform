"""Reports computed from stored records. The definitions match dc-frontend/src/utils/analytics.ts."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import List

from app.core.timeutil import iso, parse_iso, utcnow
from app.models.account import WorkspaceAlert, WorkspaceIncident
from app.models.monitoring import Prediction, Server
from app.services.infrastructure import health

DOWNTIME_WEIGHT = {"critical": 1.0, "major": 0.25, "minor": 0.0}


def _open_hours(created: datetime, resolved: datetime | None, start: datetime, end: datetime, now: datetime) -> float:
    a = max(created, start)
    b = min(resolved or now, end)
    return max(0.0, (b - a).total_seconds() / 3600)


def estimated_uptime(incidents: List[WorkspaceIncident], servers: int, start: datetime, end: datetime, now: datetime) -> float:
    """Server-hours lost to incidents / server-hours in the period. Critical = full outage, major = 25% degradation."""
    if servers == 0:
        return 1.0
    total = (end - start).total_seconds() / 3600 * servers
    lost = sum(_open_hours(i.created_at, i.resolved_at, start, end, now) * DOWNTIME_WEIGHT.get(i.severity, 0) * max(1, len(i.server_ids)) for i in incidents)
    return max(0.0, 1 - lost / total) if total else 1.0


async def summary(org_id: str, start: datetime, end: datetime) -> dict:
    now = utcnow()
    end = min(end, now)
    overlapping = await WorkspaceIncident.find({"org_id": org_id, "created_at": {"$lte": end},
                                                "$or": [{"resolved_at": None}, {"resolved_at": {"$gte": start}}]}).to_list()
    created = [i for i in overlapping if i.created_at >= start]
    resolved = [i for i in created if i.resolved_at]
    acked = [parse_iso(i.data.get("acknowledgedAt")) for i in created]
    mtta = [(a - i.created_at).total_seconds() / 60 for i, a in zip(created, acked) if a and a >= i.created_at]
    mttr = [(i.resolved_at - i.created_at).total_seconds() / 60 for i in resolved]
    servers = await Server.find(Server.org_id == org_id).to_list()
    days = []
    d = datetime(start.year, start.month, start.day)
    while d <= end:
        nxt = d + timedelta(days=1)
        bucket = [i for i in created if d <= i.created_at < nxt]
        c = Counter(i.severity for i in bucket)
        days.append({"date": d.strftime("%Y-%m-%d"), "critical": c["critical"], "major": c["major"], "minor": c["minor"],
                     "uptime": round(estimated_uptime(overlapping, len(servers), d, min(nxt, now), now) * 100, 2)})
        d = nxt
    alerts = await WorkspaceAlert.find({"org_id": org_id, "created_at": {"$gte": start, "$lte": end}}).to_list()
    preds = await Prediction.find({"org_id": org_id, "current": True}).to_list()
    sample = any(i.demo for i in overlapping) or any(s.demo for s in servers)
    return {
        "from": iso(start), "to": iso(end), "generatedAt": iso(now), "sample": sample,
        "incidents": {
            "created": len(created), "resolved": len(resolved), "activeNow": sum(1 for i in overlapping if i.status != "resolved"),
            "bySeverity": dict(Counter(i.severity for i in created)), "byCategory": dict(Counter(i.category for i in created)),
            "byStatus": dict(Counter(i.status for i in created)), "bySource": dict(Counter(i.data.get("source", "manual") for i in created)),
            "mttrMinutes": round(sum(mttr) / len(mttr)) if mttr else None, "mttaMinutes": round(sum(mtta) / len(mtta)) if mtta else None,
            "downtimeMinutes": round(sum(_open_hours(i.created_at, i.resolved_at, start, end, now) for i in overlapping if i.severity == "critical") * 60),
        },
        "uptime": {"estimated": round(estimated_uptime(overlapping, len(servers), start, end, now), 6), "servers": len(servers),
                   "definition": "Server-hours lost to incidents divided by server-hours in the period. Critical incidents count as full outage of their servers, major as 25% degradation, minor as none. This is an estimate from incident records, not a measured availability."},
        "daily": days,
        "alerts": {"created": len(alerts), "bySeverity": dict(Counter(a.data["severity"] for a in alerts)), "byStatus": dict(Counter(a.status for a in alerts))},
        "servers": {"total": len(servers), "byStatus": dict(Counter(health(s, now) for s in servers))},
        "predictions": {"current": len(preds), "anomaliesBySeverity": dict(Counter(p.severity for p in preds if p.kind == "anomaly")),
                        "earlyWarningsFlagged": sum(1 for p in preds if p.kind == "early_warning" and p.severity != "normal")},
    }
