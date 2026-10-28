"""Incidents (organization-scoped). The SPA's older /workspace/incidents routes call the same service."""
from datetime import timedelta
from types import SimpleNamespace
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Body, Depends, Query
from pydantic import Field

from app.core.auth import OrgContext, require_org
from app.core.errors import ApiException
from app.models.account import WorkspaceAlert, WorkspaceIncident
from app.models.monitoring import Prediction
from app.schemas.response import success_response
from app.schemas.workspace import IncidentAction, IncidentPatch, NewIncidentIn
from app.services import alerts as alert_svc
from app.services import incidents as svc
from app.services.accounts import audit
from app.services.infrastructure import bucket_series
from app.services.workspace import prediction_public

router = APIRouter(prefix="/incidents", tags=["Incidents"])


@router.get("")
async def list_incidents(
    ctx: OrgContext = Depends(require_org()),
    status: Optional[Literal["active", "ongoing", "investigating", "resolved"]] = None,
    severity: Optional[Literal["critical", "major", "minor"]] = None,
    server_id: Optional[str] = Query(default=None, alias="serverId"),
    limit: int = Query(default=200, ge=1, le=1000),
):
    q: dict = {"org_id": ctx.org_id}
    if status == "active":
        q["status"] = {"$ne": "resolved"}
    elif status:
        q["status"] = status
    if severity:
        q["severity"] = severity
    if server_id:
        q["server_ids"] = server_id
    rows = await WorkspaceIncident.find(q).sort("-created_at").limit(limit).to_list()
    return success_response([svc.public(r) for r in rows])


@router.post("", status_code=201)
async def create_incident(body: NewIncidentIn, ctx: OrgContext = Depends(require_org("incident:write"))):
    inc = await svc.create_manual(ctx.org_id, ctx.user.full_name, body)
    await audit(ctx.org_id, ctx.user.full_name, f"Created {inc['id']}")
    return success_response(inc)


@router.get("/{incident_id}", summary="Incident with correlated alerts, predictions and metrics around it")
async def get_incident(incident_id: str, window: Literal["1h", "6h", "24h"] = "1h", ctx: OrgContext = Depends(require_org())):
    doc = await svc.get(ctx.org_id, incident_id)
    inc = svc.public(doc)
    servers = inc.get("serverIds", [])
    alerts = await WorkspaceAlert.find({"org_id": ctx.org_id, "server_id": {"$in": servers}, "created_at": {"$gte": doc.created_at - timedelta(hours=6)}}).sort("-created_at").limit(50).to_list() if servers else []
    preds = await Prediction.find({"org_id": ctx.org_id, "server_id": {"$in": servers}, "current": True}).to_list() if servers else []
    end = doc.resolved_at
    metrics = await bucket_series(ctx.org_id, servers[:1], window, ["cpu", "memory", "temperature", "network", "disk_io", "power"], until=end) if servers else None
    return success_response({
        "incident": inc,
        "alerts": [alert_svc.alert_public(a) for a in alerts],
        "predictions": [prediction_public(p) for p in preds],
        "metrics": metrics,
        "logs": {"connected": False, "lines": [], "note": "No log integration is configured, so no log lines are correlated."},
    })


@router.patch("/{incident_id}", summary="Update fields; each change is recorded in the incident history")
async def patch_incident(incident_id: str, body: IncidentPatch, ctx: OrgContext = Depends(require_org("incident:write"))):
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise ApiException(422, "Send at least one field to change.", "validation_error")
    actor = ctx.user.full_name
    inc = None
    if "title" in data or "description" in data:
        inc = await svc.apply_action(ctx.org_id, incident_id, actor, SimpleNamespace(type="edit", title=body.title, description=body.description))
    if body.severity:
        inc = await svc.apply_action(ctx.org_id, incident_id, actor, SimpleNamespace(type="severity", severity=body.severity))
    if body.unassign or "assigneeId" in data:
        inc = await svc.apply_action(ctx.org_id, incident_id, actor, SimpleNamespace(type="assign", userId=None if body.unassign else body.assigneeId))
    if body.acknowledged:
        inc = await svc.apply_action(ctx.org_id, incident_id, actor, SimpleNamespace(type="acknowledge"))
    if body.status == "resolved":
        inc = await svc.apply_action(ctx.org_id, incident_id, actor, SimpleNamespace(type="resolve", note=body.resolutionNote))
    elif body.status:
        current = (await svc.get(ctx.org_id, incident_id)).data["status"]
        action = SimpleNamespace(type="reopen", reason=body.resolutionNote) if current == "resolved" and body.status == "ongoing" else SimpleNamespace(type="status", status=body.status)
        inc = await svc.apply_action(ctx.org_id, incident_id, actor, action)
    if body.rootCause:
        inc = await svc.apply_action(ctx.org_id, incident_id, actor, SimpleNamespace(type="confirm_root_cause", rootCause=body.rootCause))
    await audit(ctx.org_id, actor, f"Updated {incident_id}: {', '.join(data)}")
    return success_response(inc or svc.public(await svc.get(ctx.org_id, incident_id)))


@router.post("/{incident_id}/actions")
async def incident_action(
    incident_id: str,
    action: Annotated[IncidentAction, Field(discriminator="type")] = Body(...),
    ctx: OrgContext = Depends(require_org("incident:write")),
):
    inc = await svc.apply_action(ctx.org_id, incident_id, ctx.user.full_name, action)
    await audit(ctx.org_id, ctx.user.full_name, f"{action.type} {incident_id}")
    return success_response(inc)
