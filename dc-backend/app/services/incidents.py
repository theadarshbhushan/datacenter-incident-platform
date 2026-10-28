"""
Incident lifecycle: numbering, manual creation, actions, automatic creation with deduplication and
correlation, and root-cause assistance.

Deduplication: automatic incidents carry dedup_key "auto:<server>:<category>". While one is open, new
signals for the same server and category update it instead of opening another; one resolved less than
REOPEN_WINDOW ago is reopened. Correlation: a new signal for another server in the same rack and
category within CORRELATE_WINDOW joins the existing incident.
"""
from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from typing import List, Optional

from pymongo import ReturnDocument

from app.core.errors import ApiException, not_found
from app.core.timeutil import iso, utcnow
from app.ml.diagnostics import analyze
from app.ml.inference import registry
from app.models.account import Membership, WorkspaceAlert, WorkspaceIncident, new_id
from app.models.monitoring import Counter, Prediction, Rack, Server

REOPEN_WINDOW = timedelta(minutes=30)
CORRELATE_WINDOW = timedelta(hours=2)
SIGNAL_NOTE_EVERY = timedelta(minutes=30)
SEVERITY_RANK = {"minor": 0, "major": 1, "critical": 2}
CATEGORIES = ("thermal", "power", "network", "hardware", "storage", "software", "capacity")


async def next_incident_id(org_id: str) -> str:
    year = utcnow().year
    coll = Counter.get_motor_collection()
    key = f"incident:{org_id}:{year}"
    doc = await coll.find_one_and_update({"_id": key}, {"$inc": {"value": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    n = doc["value"]
    if n == 1:
        # Continue numbering after incidents created before counters existed (or seeded sample incidents).
        existing = await WorkspaceIncident.find({"org_id": org_id, "incident_id": {"$regex": f"^INC-{year}-"}}).to_list()
        start = max([int(r.incident_id.rsplit("-", 1)[-1]) for r in existing if r.incident_id.rsplit("-", 1)[-1].isdigit()] or [0])
        if start:
            doc = await coll.find_one_and_update({"_id": key}, {"$set": {"value": start + 1}}, return_document=ReturnDocument.AFTER)
            n = doc["value"]
    return f"INC-{year}-{n:04d}"


def event(kind: str, actor: str, message: str, at: Optional[str] = None) -> dict:
    return {"id": new_id("t_"), "at": at or iso(utcnow()), "type": kind, "actor": actor, "message": message}


async def get(org_id: str, incident_id: str) -> WorkspaceIncident:
    doc = await WorkspaceIncident.find_one({"org_id": org_id, "incident_id": incident_id})
    if not doc:
        raise not_found("Incident not found.")
    return doc


async def is_member(org_id: str, user_id: str) -> bool:
    return await Membership.find_one({"org_id": org_id, "user_id": user_id}) is not None


async def build_analysis(org_id: str, category: str, server_ids: List[str], exclude_incident: Optional[str] = None) -> dict:
    """Root-cause assistance from the primary server's latest per-metric scores, rack-mates, alerts and history."""
    now = utcnow()
    server = await Server.find_one({"org_id": org_id, "_id": server_ids[0]}) if server_ids else None
    metrics, offline, rack_label, mates, rack_size, similar = {}, False, None, 0, 0, []
    alerts: List[dict] = []
    if server:
        from app.services.infrastructure import connectivity

        offline = connectivity(server, now) == "offline" and server.last_seen is not None
        pred = await Prediction.find_one({"org_id": org_id, "server_id": server.id, "kind": "anomaly", "current": True})
        if pred:
            metrics = {d["metric"]: d for d in pred.details}
        if server.rack_id:
            rack = await Rack.find_one({"_id": server.rack_id, "org_id": org_id})
            rack_label = rack.label if rack else None
            peers = await Server.find({"org_id": org_id, "rack_id": server.rack_id, "_id": {"$ne": server.id}}).to_list()
            rack_size = len(peers) + 1
            if pred and pred.metric:
                peer_preds = await Prediction.find({"org_id": org_id, "kind": "anomaly", "current": True, "server_id": {"$in": [p.id for p in peers]},
                                                    "metric": pred.metric, "severity": {"$in": ["warning", "critical"]}}).to_list()
                mates = len(peer_preds)
        rows = await WorkspaceAlert.find({"org_id": org_id, "server_id": {"$in": server_ids}, "status": "active"}).to_list()
        alerts = [r.data for r in rows]
        hist = await WorkspaceIncident.find({"org_id": org_id, "server_ids": server.id, "category": category,
                                             "created_at": {"$gte": now - timedelta(days=30)}}).sort("-created_at").to_list()
        similar = [h.incident_id for h in hist if h.incident_id != exclude_incident][:5]
    return analyze(category, metrics, offline, rack_label, mates, rack_size, alerts, similar, registry.version, iso(now))


def _doc(org_id: str, inc: dict, demo: bool = False, dedup_key: Optional[str] = None) -> WorkspaceIncident:
    return WorkspaceIncident(org_id=org_id, incident_id=inc["id"], created_at=utcnow(), data=inc, dedup_key=dedup_key, demo=demo,
                             last_signal_at=utcnow() if dedup_key else None).sync()


async def create_manual(org_id: str, actor_name: str, body) -> dict:
    """`body` is schemas.workspace.NewIncidentIn."""
    if body.assigneeId and not await is_member(org_id, body.assigneeId):
        raise ApiException(400, "Assignee is not a member of this organization.", "invalid_assignee")
    from app.services.infrastructure import ensure_location

    servers = await Server.find({"org_id": org_id, "_id": {"$in": body.serverIds}}).to_list() if body.serverIds else []
    if len(servers) != len(set(body.serverIds)):
        raise ApiException(400, "One or more servers do not exist in this organization.", "invalid_server")
    rack_id = body.rackId or (servers[0].rack_id if servers else "") or ""
    dc_id, rack_id = await ensure_location(org_id, None, rack_id or None)
    if not dc_id and servers:
        dc_id = servers[0].dc_id
    iid = await next_incident_id(org_id)
    now = iso(utcnow())
    inc = {
        "id": iid, "title": body.title, "description": body.description, "severity": body.severity, "status": "ongoing",
        "category": body.category, "serverIds": [s.id for s in servers], "rackId": rack_id or "", "dcId": dc_id or "",
        "assigneeId": body.assigneeId, "acknowledged": False, "acknowledgedAt": None, "createdAt": now, "updatedAt": now,
        "resolvedAt": None, "source": "manual", "sample": False,
        "timeline": [event("created", actor_name, "Incident created manually.", now)],
        "analysis": await build_analysis(org_id, body.category, [s.id for s in servers]),
    }
    if body.assigneeId:
        from app.core.auth import load_user

        a = await load_user(body.assigneeId)
        inc["timeline"].append(event("assigned", actor_name, f"Assigned to {a.full_name if a else 'teammate'}.", now))
    await _doc(org_id, inc).insert()
    return inc


async def apply_action(org_id: str, incident_id: str, actor_name: str, action) -> dict:
    """`action` is one of schemas.workspace.IncidentAction."""
    doc = await get(org_id, incident_id)
    inc = dict(doc.data)
    inc["timeline"] = list(inc.get("timeline", []))
    now = iso(utcnow())

    def add(kind: str, message: str):
        inc["timeline"].append(event(kind, actor_name, message, now))

    t = action.type
    if t == "acknowledge":
        if inc["status"] == "resolved":
            raise ApiException(400, "Resolved incidents cannot be acknowledged.")
        if inc.get("acknowledged"):
            raise ApiException(400, "Incident is already acknowledged.")
        inc["acknowledged"], inc["acknowledgedAt"] = True, now
        if inc["status"] == "ongoing":
            inc["status"] = "investigating"
        add("status", "Acknowledged and moved to Investigating.")
    elif t == "assign":
        if action.userId and not await is_member(org_id, action.userId):
            raise ApiException(400, "Assignee is not a member of this organization.", "invalid_assignee")
        from app.core.auth import load_user

        inc["assigneeId"] = action.userId
        a = await load_user(action.userId) if action.userId else None
        add("assigned", f"Assigned to {a.full_name}." if a else "Unassigned.")
    elif t == "status":
        if action.status == "resolved":
            return await apply_action(org_id, incident_id, actor_name, SimpleNamespace(type="resolve", note=None))
        if inc["status"] == "resolved":
            inc["resolvedAt"] = None
        inc["status"] = action.status
        add("status", f"Status changed to {action.status}.")
    elif t == "severity":
        if action.severity == inc["severity"]:
            raise ApiException(400, f"Severity is already {action.severity}.")
        add("severity", f"Severity changed from {inc['severity']} to {action.severity}.")
        inc["severity"] = action.severity
    elif t == "resolve":
        if inc["status"] == "resolved":
            raise ApiException(400, "Incident is already resolved.")
        inc["status"], inc["resolvedAt"], inc["acknowledged"] = "resolved", now, True
        inc["acknowledgedAt"] = inc.get("acknowledgedAt") or now
        add("resolved", f"Resolved: {action.note}" if action.note else "Resolved.")
    elif t == "reopen":
        if inc["status"] != "resolved":
            raise ApiException(400, "Only resolved incidents can be reopened.")
        inc["status"], inc["resolvedAt"] = "ongoing", None
        add("reopened", f"Reopened: {action.reason}" if action.reason else "Reopened.")
    elif t == "comment":
        add("comment", action.message)
    elif t == "confirm_root_cause":
        analysis = dict(inc.get("analysis") or {})
        analysis.update({"rootCause": action.rootCause, "rootCauseStatus": "confirmed", "confirmedBy": actor_name, "confirmedAt": now})
        inc["analysis"] = analysis
        add("ai", f"Root cause confirmed: {action.rootCause}")
    elif t == "refresh_analysis":
        inc["analysis"] = await build_analysis(org_id, inc["category"], inc.get("serverIds", []), exclude_incident=incident_id)
        add("ai", "Root-cause assistance refreshed from current telemetry.")
    elif t == "edit":
        if action.title is not None:
            inc["title"] = action.title
        if action.description is not None:
            inc["description"] = action.description
        add("comment", "Details edited.")
    inc["updatedAt"] = now
    doc.data = inc
    await doc.sync().save()
    return inc


async def on_signal(org_id: str, server: Server, category: str, severity: str, source: str, title: str, description: str,
                    signal: str, demo: bool = False) -> Optional[dict]:
    """
    Open, update, reopen or correlate an automatic incident for a signal on `server`. Returns the
    incident if one was created or changed.
    """
    now = utcnow()
    key = f"auto:{server.id}:{category}"
    open_doc = await WorkspaceIncident.find_one({"org_id": org_id, "dedup_key": key, "status": {"$ne": "resolved"}})
    if not open_doc:
        recent = await WorkspaceIncident.find({"org_id": org_id, "dedup_key": key, "status": "resolved",
                                               "resolved_at": {"$gte": now - REOPEN_WINDOW}}).sort("-resolved_at").first_or_none()
        if recent:
            inc = dict(recent.data)
            inc["timeline"] = [*inc["timeline"], event("reopened", "VaultWatch", f"Reopened automatically: {signal}")]
            inc["status"], inc["resolvedAt"], inc["updatedAt"] = "ongoing", None, iso(now)
            recent.data, recent.last_signal_at = inc, now
            await recent.sync().save()
            return inc
    if not open_doc and server.rack_id:
        # Correlate with an open automatic incident for the same category in the same rack.
        peer = await WorkspaceIncident.find({"org_id": org_id, "rack_id": server.rack_id, "category": category, "status": {"$ne": "resolved"},
                                             "dedup_key": {"$ne": None}, "created_at": {"$gte": now - CORRELATE_WINDOW}}).sort("-created_at").first_or_none()
        if peer:
            inc = dict(peer.data)
            if server.id not in inc["serverIds"]:
                inc["serverIds"] = [*inc["serverIds"], server.id]
                inc["timeline"] = [*inc["timeline"], event("ai", "VaultWatch", f"Correlated: {server.hostname} shows the same {category} signal ({signal}).")]
                inc["updatedAt"] = iso(now)
                peer.data, peer.last_signal_at = inc, now
                await peer.sync().save()
                return inc
            return None
    if open_doc:
        inc = dict(open_doc.data)
        changed = False
        if SEVERITY_RANK.get(severity, 0) > SEVERITY_RANK.get(inc["severity"], 0):
            inc["timeline"] = [*inc["timeline"], event("severity", "VaultWatch", f"Severity raised from {inc['severity']} to {severity}: {signal}")]
            inc["severity"] = severity
            changed = True
        elif not open_doc.last_signal_at or now - open_doc.last_signal_at >= SIGNAL_NOTE_EVERY:
            inc["timeline"] = [*inc["timeline"], event("ai", "VaultWatch", f"Signal still present: {signal}")]
            changed = True
        if changed:
            inc["updatedAt"] = iso(now)
            open_doc.data, open_doc.last_signal_at = inc, now
            await open_doc.sync().save()
            return inc
        return None
    iid = await next_incident_id(org_id)
    at = iso(now)
    inc = {
        "id": iid, "title": title, "description": description, "severity": severity, "status": "ongoing", "category": category,
        "serverIds": [server.id], "rackId": server.rack_id or "", "dcId": server.dc_id or "", "assigneeId": None,
        "acknowledged": False, "acknowledgedAt": None, "createdAt": at, "updatedAt": at, "resolvedAt": None, "source": source, "sample": demo,
        "timeline": [event("created", "VaultWatch", f"Incident opened automatically by {'anomaly detection' if source == 'ai' else 'an alert rule'}: {signal}", at)],
        "analysis": await build_analysis(org_id, category, [server.id]),
    }
    inc["timeline"].append(event("ai", "VaultWatch", "Root-cause assistance attached (suspected, rule-based).", at))
    await _doc(org_id, inc, demo=demo, dedup_key=key).insert()
    return inc


def public(doc: WorkspaceIncident) -> dict:
    d = dict(doc.data)
    d.setdefault("sample", doc.demo)
    return d
