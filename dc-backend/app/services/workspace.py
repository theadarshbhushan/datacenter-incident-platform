"""Per-organization workspace: sample or empty environments, connected servers, and the full API view."""
from datetime import datetime, timedelta
from typing import List, Optional

from app.core.auth import OrgContext
from app.models.account import ApiKey, AuditEntry, Invitation, OrgWorkspace, WorkspaceAlert, WorkspaceIncident, new_id
from app.models.metric import Metric
from app.models.server import Server
from app.services import sample_data as sd
from app.services.accounts import invitation_public, list_members


def _parse(ts: str) -> datetime:
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")


async def replace_with_sample(org_id: str, owner_name: str, dc_name: Optional[str] = None, env_name: Optional[str] = None,
                              keep_settings: bool = False, assignees: Optional[List[str]] = None) -> OrgWorkspace:
    """Load the labeled sample environment into an organization, replacing its incidents and alerts."""
    now = sd.now_ms()
    racks, servers = sd.build_infrastructure()
    dcs = [dict(d) for d in sd.DEMO_DATA_CENTERS]
    if dc_name:
        dcs[0]["name"] = dc_name
        dcs[0]["environment"] = env_name or dcs[0]["environment"]
    ws = await OrgWorkspace.get(org_id)
    if not ws:
        ws = OrgWorkspace(id=org_id)
        keep_settings = False
    ws.data_centers, ws.racks, ws.servers = dcs, racks, servers
    ws.predictions = sd.build_predictions(servers, now)
    ws.model = sd.demo_model(now)
    ws.sample = True
    if not keep_settings:
        ws.alert_rules = sd.default_alert_rules()
        ws.notification_settings = sd.default_notification_settings()
        ws.monitoring = sd.default_monitoring()
    ws.updated_at = datetime.utcnow()
    await ws.save()

    await WorkspaceIncident.find(WorkspaceIncident.org_id == org_id).delete()
    await WorkspaceAlert.find(WorkspaceAlert.org_id == org_id).delete()
    incidents = sd.build_incidents(servers, now, owner_name)
    if assignees:
        for i, inc in enumerate(incidents):
            inc["assigneeId"] = assignees[i % len(assignees)]
    if incidents:
        await WorkspaceIncident.insert_many([WorkspaceIncident(org_id=org_id, incident_id=i["id"], created_at=_parse(i["createdAt"]), data=i) for i in incidents])
    alerts = sd.build_alerts(now)
    await WorkspaceAlert.insert_many([WorkspaceAlert(org_id=org_id, alert_id=a["id"], created_at=_parse(a["createdAt"]), data=a) for a in alerts])
    return ws


async def replace_with_empty(org_id: str, dc_name: Optional[str] = None, env_name: Optional[str] = None) -> OrgWorkspace:
    ws = OrgWorkspace(
        id=org_id,
        data_centers=[{"id": new_id("dc_"), "name": dc_name, "location": "—", "environment": env_name or "Production"}] if dc_name else [],
        alert_rules=sd.default_alert_rules(),
        notification_settings=sd.default_notification_settings(),
        monitoring=sd.default_monitoring(),
        sample=False,
    )
    await ws.save()
    await WorkspaceIncident.find(WorkspaceIncident.org_id == org_id).delete()
    await WorkspaceAlert.find(WorkspaceAlert.org_id == org_id).delete()
    return ws


async def get_or_create(org_id: str) -> OrgWorkspace:
    ws = await OrgWorkspace.get(org_id)
    return ws or await replace_with_empty(org_id)


def _status(cpu: float, mem: float, temp: float, seen: Optional[datetime]) -> tuple[str, str]:
    if not seen or datetime.utcnow() - seen > timedelta(minutes=10):
        return "offline", "offline"
    if cpu >= 90 or mem >= 95 or temp >= 80:
        return "critical", "online"
    if cpu >= 80 or mem >= 85 or temp >= 70:
        return "warning", "online"
    return "healthy", "online"


async def connected_servers(org_id: str, ws: OrgWorkspace) -> List[dict]:
    """Servers reporting through the ingestion API with this organization's API key."""
    servers = await Server.find(Server.org_id == org_id).to_list()
    dc_id = ws.data_centers[0]["id"] if ws.data_centers else "dc-connected"
    out = []
    for slot, s in enumerate(servers, start=1):
        m = await Metric.find(Metric.server_id == s.server_id).sort("-timestamp").first_or_none()
        cpu, mem, temp = (m.cpu_pct, m.ram_pct, m.temp_celsius) if m else (0, 0, 0)
        status, conn = _status(cpu, mem, temp, s.last_seen)
        out.append({
            "id": s.server_id, "hostname": s.hostname, "rackId": f"rack-{s.rack}".lower(), "dcId": dc_id, "slot": slot,
            "role": s.hardware_type, "ip": s.ip_address, "model": "—", "cpu": round(cpu), "memory": round(mem),
            "storage": round(m.disk_used_pct) if m else 0, "temperature": round(temp), "powerW": 0, "networkLatencyMs": 0,
            "connectivity": conn, "status": status, "uptimeDays": 0,
        })
    return out


async def full_workspace(ctx: OrgContext) -> dict:
    org_id = ctx.org_id
    ws = await get_or_create(org_id)
    servers = list(ws.servers)
    racks = list(ws.racks)
    if not ws.sample:
        live = await connected_servers(org_id, ws)
        servers += live
        known = {r["id"] for r in racks}
        for s in live:
            if s["rackId"] not in known:
                known.add(s["rackId"])
                racks.append({"id": s["rackId"], "label": s["rackId"].removeprefix("rack-").upper(), "dcId": s["dcId"], "row": s["rackId"][5:6].upper() or "A",
                              "position": len(racks) + 1, "powerKw": 0, "powerCapacityKw": 8, "inletTemp": 0, "status": "healthy"})
    incidents = [d.data for d in await WorkspaceIncident.find(WorkspaceIncident.org_id == org_id).sort("-created_at").to_list()]
    alerts = [d.data for d in await WorkspaceAlert.find(WorkspaceAlert.org_id == org_id).sort("-created_at").to_list()]
    keys = await ApiKey.find(ApiKey.org_id == org_id).sort("+created_at").to_list()
    audit_rows = await AuditEntry.find(AuditEntry.org_id == org_id).sort("-at").limit(200).to_list()
    invitations = await Invitation.find(Invitation.org_id == org_id).sort("+created_at").to_list()
    return {
        "dataCenters": ws.data_centers,
        "racks": racks,
        "servers": servers,
        "incidents": incidents,
        "predictions": ws.predictions,
        "model": ws.model,
        "alerts": alerts,
        "alertRules": ws.alert_rules,
        "notificationSettings": ws.notification_settings,
        "monitoring": ws.monitoring,
        "apiKeys": [api_key_public(k) for k in keys],
        "members": await list_members(org_id),
        "invitations": [invitation_public(i) for i in invitations],
        "audit": [{"id": str(a.id), "at": sd.iso(a.at), "actor": a.actor, "action": a.action} for a in audit_rows],
        "sample": ws.sample,
    }


def api_key_public(k: ApiKey) -> dict:
    return {
        "id": k.id, "name": k.name, "prefix": k.prefix, "scopes": k.scopes, "createdAt": sd.iso(k.created_at),
        "lastUsedAt": sd.iso(k.last_used_at) if k.last_used_at else None, "createdBy": k.created_by,
    }
