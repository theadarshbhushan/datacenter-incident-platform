"""Per-organization workspace: settings, setup after onboarding, and the aggregated view the SPA loads."""
from typing import List, Optional

from app.core.auth import OrgContext
from app.core.timeutil import iso
from app.ml.inference import registry
from app.models.account import ApiKey, AuditEntry, Invitation, OrgWorkspace, WorkspaceAlert, WorkspaceIncident
from app.models.monitoring import AlertRule, DataCenter, Prediction
from app.services import sample_data as sd
from app.services.accounts import invitation_public, list_members


async def ensure_settings(org_id: str) -> OrgWorkspace:
    """Settings document and default alert rules, created on first use."""
    ws = await OrgWorkspace.get(org_id)
    if not ws:
        ws = OrgWorkspace(id=org_id, notification_settings=sd.default_notification_settings(), monitoring=sd.default_monitoring())
        await ws.insert()
    if not ws.notification_settings or not ws.monitoring:
        ws.notification_settings = ws.notification_settings or sd.default_notification_settings()
        ws.monitoring = ws.monitoring or sd.default_monitoring()
        await ws.save()
    if not await AlertRule.find_one(AlertRule.org_id == org_id):
        await AlertRule.insert_many([
            AlertRule(org_id=org_id, name=r["name"], metric=r["metric"], operator=r["operator"], threshold=r["threshold"], duration_min=r["durationMin"],
                      severity=r["severity"], enabled=r["enabled"], channels=r["channels"], position=i)
            for i, r in enumerate(sd.default_alert_rules())
        ])
    return ws


async def setup_live(org_id: str, dc_name: Optional[str], env_name: Optional[str]) -> None:
    """Onboarding without sample data: register the named data center, nothing else."""
    await ensure_settings(org_id)
    if dc_name and not await DataCenter.find_one({"org_id": org_id, "name": dc_name, "demo": False}):
        await DataCenter(org_id=org_id, name=dc_name, location="", environment=env_name or "Production").insert()


def prediction_public(p: Prediction) -> dict:
    return {
        "id": p.id, "serverId": p.server_id, "rackId": p.rack_id or "", "dcId": p.dc_id or "", "kind": p.kind, "type": p.type,
        "category": p.category, "metric": p.metric, "severity": p.severity, "anomalyScore": p.anomaly_score, "riskScore": p.risk_score,
        "probability": p.probability, "probabilityCalibrated": p.probability_calibrated, "horizon": p.horizon,
        "confidence": p.confidence, "confidenceReason": p.confidence_reason,
        "factors": [f.model_dump() for f in p.factors], "details": p.details, "recommendation": p.recommendation,
        "modelVersion": p.model_version, "experimental": p.experimental, "generatedAt": iso(p.generated_at),
        "dataTime": iso(p.bucket_start), "expectedAt": iso(p.expected_at), "sample": p.demo, "current": p.current,
    }


def model_public() -> Optional[dict]:
    st = registry.status()
    if not st["ready"]:
        return {"name": "Anomaly detection", "version": None, "trainedAt": None, "ready": False, "error": st["error"], "sample": False}
    return {
        "name": "Isolation Forest anomaly detection + experimental early warning", "version": st["version"], "trainedAt": st["trainedAt"],
        "ready": True, "sample": False, "earlyWarning": st["earlyWarning"], "evaluation": st["evaluation"],
    }


async def current_predictions(org_id: str) -> List[dict]:
    rows = await Prediction.find({"org_id": org_id, "current": True}).sort("-generated_at").to_list()
    return [prediction_public(p) for p in rows]


async def full_workspace(ctx: OrgContext) -> dict:
    from app.services import alerts as alert_svc
    from app.services import demo as demo_svc
    from app.services import incidents as incident_svc
    from app.services import telemetry as telemetry_svc
    from app.services.infrastructure import inventory

    org_id = ctx.org_id
    ws = await ensure_settings(org_id)
    sample = await demo_svc.has_demo(org_id)
    if sample:
        await demo_svc.top_up(org_id)
    inv = await inventory(org_id)
    incidents = [incident_svc.public(d) for d in await WorkspaceIncident.find(WorkspaceIncident.org_id == org_id).sort("-created_at").to_list()]
    alerts = [alert_svc.alert_public(d) for d in await WorkspaceAlert.find(WorkspaceAlert.org_id == org_id).sort("-created_at").limit(500).to_list()]
    keys = await ApiKey.find(ApiKey.org_id == org_id).sort("+created_at").to_list()
    audit_rows = await AuditEntry.find(AuditEntry.org_id == org_id).sort("-at").limit(200).to_list()
    invitations = await Invitation.find(Invitation.org_id == org_id).sort("+created_at").to_list()
    return {
        **inv,
        "incidents": incidents,
        "predictions": await current_predictions(org_id),
        "model": model_public(),
        "alerts": alerts,
        "alertRules": [alert_svc.rule_public(r) for r in await alert_svc.list_rules(org_id)],
        "notificationSettings": ws.notification_settings,
        "monitoring": ws.monitoring,
        "telemetry": await telemetry_svc.health(org_id),
        "apiKeys": [api_key_public(k) for k in keys],
        "members": await list_members(org_id),
        "invitations": [invitation_public(i) for i in invitations],
        "audit": [{"id": str(a.id), "at": iso(a.at), "actor": a.actor, "action": a.action} for a in audit_rows],
        "sample": sample,
    }


def api_key_public(k: ApiKey) -> dict:
    return {
        "id": k.id, "name": k.name, "prefix": k.prefix, "scopes": k.scopes, "createdAt": iso(k.created_at),
        "lastUsedAt": iso(k.last_used_at), "createdBy": k.created_by,
    }
