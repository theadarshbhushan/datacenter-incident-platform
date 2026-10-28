"""Alerts, alert rules, notification settings and the notification delivery log."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

from app.core.auth import OrgContext, require_org
from app.core.errors import not_found
from app.models.account import WorkspaceAlert
from app.models.monitoring import AlertRule, Notification
from app.schemas.response import success_response
from app.schemas.workspace import AlertActionIn, AlertRuleIn, NotificationSettingsIn
from app.core.timeutil import iso
from app.services import alerts as svc
from app.services.accounts import audit
from app.services.workspace import ensure_settings

router = APIRouter(tags=["Alerts"])


@router.get("/alerts")
async def list_alerts(
    ctx: OrgContext = Depends(require_org()),
    status: Optional[Literal["active", "acknowledged", "dismissed", "resolved"]] = None,
    limit: int = Query(default=200, ge=1, le=1000),
):
    q: dict = {"org_id": ctx.org_id}
    if status:
        q["status"] = status
    rows = await WorkspaceAlert.find(q).sort("-created_at").limit(limit).to_list()
    return success_response([svc.alert_public(r) for r in rows])


@router.post("/alerts/{alert_id}/actions")
async def alert_action(alert_id: str, body: AlertActionIn, ctx: OrgContext = Depends(require_org("alert:act"))):
    return success_response(await svc.act(ctx.org_id, alert_id, body.type, ctx.user.full_name))


@router.get("/alert-rules")
async def list_rules(ctx: OrgContext = Depends(require_org())):
    await ensure_settings(ctx.org_id)
    return success_response([svc.rule_public(r) for r in await svc.list_rules(ctx.org_id)])


@router.put("/alert-rules/{rule_id}", summary="Create (rule_id = new) or replace an alert rule")
async def save_rule(rule_id: str, body: AlertRuleIn, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    r = await svc.save_rule(ctx.org_id, rule_id, body)
    await audit(ctx.org_id, ctx.user.full_name, f'Saved alert rule "{r.name}"')
    return success_response(svc.rule_public(r))


@router.delete("/alert-rules/{rule_id}")
async def delete_rule(rule_id: str, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    r = await AlertRule.find_one({"_id": rule_id, "org_id": ctx.org_id})
    if not r:
        raise not_found("Alert rule not found.")
    await r.delete()
    await audit(ctx.org_id, ctx.user.full_name, f'Deleted alert rule "{r.name}"')
    return success_response(None)


@router.put("/notification-settings")
async def update_notifications(body: NotificationSettingsIn, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    ws = await ensure_settings(ctx.org_id)
    ws.notification_settings = body.model_dump()
    await ws.save()
    await audit(ctx.org_id, ctx.user.full_name, "Updated notification settings")
    return success_response(ws.notification_settings)


@router.get("/notifications", summary="What happened to each notification (sent, failed, not configured...)")
async def notifications(ctx: OrgContext = Depends(require_org()), limit: int = Query(default=100, ge=1, le=500)):
    rows = await Notification.find(Notification.org_id == ctx.org_id).sort("-created_at").limit(limit).to_list()
    return success_response([{"alertId": n.alert_id, "channel": n.channel, "status": n.status, "detail": n.detail, "at": iso(n.created_at)} for n in rows])
