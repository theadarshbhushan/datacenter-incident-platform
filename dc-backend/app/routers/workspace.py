"""Organization workspace, team management and API keys. Every route is scoped to the caller's org."""
from datetime import datetime
from typing import Annotated

from pydantic import Field

from fastapi import APIRouter, Body, Depends, Request

from app.core import ratelimit
from app.core.auth import OrgContext, client_ip, load_user, require_org
from app.core.config import settings
from app.core.errors import ApiException, forbidden, not_found
from app.core.mailer import send_email
from app.core.permissions import assignable_roles, can_manage_member
from app.core.tokens import hash_token, new_token
from app.models.account import (
    ApiKey, ContactMessage, DevMail, Invitation, Membership, OrgWorkspace, UserSession, WorkspaceAlert, WorkspaceIncident, new_id,
)
from app.schemas.account import ApiKeyIn, ContactIn, InviteIn, RoleIn
from app.schemas.response import success_response
from app.schemas.workspace import AlertActionIn, AlertRuleIn, IncidentAction, MonitoringIn, NewIncidentIn, NotificationSettingsIn
from app.services import workspace as wsvc
from app.services.accounts import INVITE_TTL, audit, create_invitation, invitation_public, list_members, normalize_email, send_invitation_email
from app.services.sample_data import analysis_for, iso

router = APIRouter(tags=["Workspace"])
public = APIRouter(tags=["Public"])


def _now() -> str:
    return iso(datetime.utcnow())


async def _incident(ctx: OrgContext, incident_id: str) -> WorkspaceIncident:
    doc = await WorkspaceIncident.find_one({"org_id": ctx.org_id, "incident_id": incident_id})
    if not doc:
        raise not_found("Incident not found.")
    return doc


async def _is_member(org_id: str, user_id: str) -> bool:
    return await Membership.find_one({"org_id": org_id, "user_id": user_id}) is not None


@router.get("/workspace")
async def get_workspace(ctx: OrgContext = Depends(require_org())):
    return success_response(await wsvc.full_workspace(ctx))


@router.post("/workspace/incidents")
async def create_incident(body: NewIncidentIn, ctx: OrgContext = Depends(require_org("incident:write"))):
    ws = await wsvc.get_or_create(ctx.org_id)
    if body.assigneeId and not await _is_member(ctx.org_id, body.assigneeId):
        raise ApiException(400, "Assignee is not a member of this organization.", "invalid_assignee")
    rack = next((r for r in ws.racks if r["id"] == body.rackId), None)
    year = datetime.utcnow().year
    rows = await WorkspaceIncident.find(WorkspaceIncident.org_id == ctx.org_id).to_list()
    max_n = max([int(r.incident_id.rsplit("-", 1)[-1]) for r in rows if r.incident_id.rsplit("-", 1)[-1].isdigit()] or [0])
    iid = f"INC-{year}-{max_n + 1:04d}"
    now = _now()
    inc = {
        "id": iid, "title": body.title, "description": body.description, "severity": body.severity, "status": "ongoing",
        "category": body.category, "serverIds": body.serverIds, "rackId": body.rackId,
        "dcId": rack["dcId"] if rack else (ws.data_centers[0]["id"] if ws.data_centers else ""),
        "assigneeId": body.assigneeId, "acknowledged": False, "acknowledgedAt": None, "createdAt": now, "updatedAt": now,
        "resolvedAt": None, "source": "manual",
        "timeline": [{"id": new_id("t_"), "at": now, "type": "created", "actor": ctx.user.full_name, "message": "Incident created manually."}],
        # Template guidance for the category, labeled as sample. No model ran.
        "analysis": analysis_for(body.category),
    }
    if body.assigneeId:
        a = await load_user(body.assigneeId)
        inc["timeline"].append({"id": new_id("t_"), "at": now, "type": "assigned", "actor": ctx.user.full_name, "message": f"Assigned to {a.full_name if a else 'teammate'}."})
    await WorkspaceIncident(org_id=ctx.org_id, incident_id=iid, created_at=datetime.utcnow(), data=inc).insert()
    await audit(ctx.org_id, ctx.user.full_name, f"Created {iid}")
    return success_response(inc)


@router.post("/workspace/incidents/{incident_id}/actions")
async def incident_action(
    incident_id: str,
    action: Annotated[IncidentAction, Field(discriminator="type")] = Body(...),
    ctx: OrgContext = Depends(require_org("incident:write")),
):
    doc = await _incident(ctx, incident_id)
    inc = dict(doc.data)
    inc["timeline"] = list(inc.get("timeline", []))
    now = _now()

    def add(kind: str, message: str):
        inc["timeline"].append({"id": new_id("t_"), "at": now, "type": kind, "actor": ctx.user.full_name, "message": message})

    t = action.type
    if t == "acknowledge":
        if inc["status"] == "resolved":
            raise ApiException(400, "Resolved incidents cannot be acknowledged.")
        inc["acknowledged"], inc["acknowledgedAt"] = True, now
        if inc["status"] == "ongoing":
            inc["status"] = "investigating"
        add("status", "Acknowledged and moved to Investigating.")
    elif t == "assign":
        if action.userId and not await _is_member(ctx.org_id, action.userId):
            raise ApiException(400, "Assignee is not a member of this organization.", "invalid_assignee")
        inc["assigneeId"] = action.userId
        a = await load_user(action.userId) if action.userId else None
        add("assigned", f"Assigned to {a.full_name}." if a else "Unassigned.")
    elif t == "status":
        inc["status"] = action.status
        if action.status == "resolved" and not inc.get("resolvedAt"):
            inc["resolvedAt"] = now
        if action.status != "resolved":
            inc["resolvedAt"] = None
        add("status", f"Status changed to {action.status}.")
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
    inc["updatedAt"] = now
    doc.data = inc
    await doc.save()
    await audit(ctx.org_id, ctx.user.full_name, f"{t} {incident_id}")
    return success_response(inc)


@router.post("/workspace/alerts/{alert_id}/actions")
async def alert_action(alert_id: str, body: AlertActionIn, ctx: OrgContext = Depends(require_org("alert:act"))):
    doc = await WorkspaceAlert.find_one({"org_id": ctx.org_id, "alert_id": alert_id})
    if not doc:
        raise not_found("Alert not found.")
    data = dict(doc.data)
    if body.type == "acknowledge":
        data["status"], data["acknowledgedBy"] = "acknowledged", ctx.user.full_name
    else:
        data["status"] = "dismissed"
    doc.data = data
    await doc.save()
    return success_response(data)


@router.put("/workspace/alert-rules/{rule_id}")
async def save_alert_rule(rule_id: str, body: AlertRuleIn, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    ws = await wsvc.get_or_create(ctx.org_id)
    rule = body.model_dump()
    rule["id"] = rule_id if rule_id != "new" else new_id("rule_")
    if rule["threshold"] == int(rule["threshold"]):
        rule["threshold"] = int(rule["threshold"])
    rules = [r for r in ws.alert_rules if r["id"] != rule["id"]]
    idx = next((i for i, r in enumerate(ws.alert_rules) if r["id"] == rule["id"]), None)
    if idx is None:
        rules.append(rule)
    else:
        rules.insert(idx, rule)
    ws.alert_rules = rules
    await ws.save()
    await audit(ctx.org_id, ctx.user.full_name, f'Saved alert rule "{rule["name"]}"')
    return success_response(rule)


@router.delete("/workspace/alert-rules/{rule_id}")
async def delete_alert_rule(rule_id: str, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    ws = await wsvc.get_or_create(ctx.org_id)
    ws.alert_rules = [r for r in ws.alert_rules if r["id"] != rule_id]
    await ws.save()
    await audit(ctx.org_id, ctx.user.full_name, "Deleted an alert rule")
    return success_response(None)


@router.put("/workspace/notification-settings")
async def update_notifications(body: NotificationSettingsIn, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    ws = await wsvc.get_or_create(ctx.org_id)
    ws.notification_settings = body.model_dump()
    await ws.save()
    await audit(ctx.org_id, ctx.user.full_name, "Updated notification settings")
    return success_response(ws.notification_settings)


@router.put("/workspace/monitoring")
async def update_monitoring(body: MonitoringIn, ctx: OrgContext = Depends(require_org("monitoring:manage"))):
    ws = await wsvc.get_or_create(ctx.org_id)
    ws.monitoring = body.model_dump()
    await ws.save()
    await audit(ctx.org_id, ctx.user.full_name, "Updated monitoring settings")
    return success_response(ws.monitoring)


@router.post("/workspace/sample-environment")
async def load_sample(ctx: OrgContext = Depends(require_org("infra:manage"))):
    prev = await OrgWorkspace.get(ctx.org_id)
    dc = prev.data_centers[0] if prev and prev.data_centers else {}
    await wsvc.replace_with_sample(ctx.org_id, ctx.user.full_name, dc.get("name"), dc.get("environment"), keep_settings=True)
    ctx.org.monitoring_mode = "demo"
    await ctx.org.save()
    await audit(ctx.org_id, ctx.user.full_name, "Loaded sample environment")
    return success_response(None)


# ---------- team ----------

@router.post("/team/invitations")
async def invite(body: InviteIn, ctx: OrgContext = Depends(require_org("team:manage"))):
    if body.role not in assignable_roles(ctx.role):
        raise forbidden("You cannot invite members with that role.")
    ratelimit.hit(f"invite:{ctx.org_id}", 50, 3600, "Too many invitations sent. Try again later.")
    email = normalize_email(body.email)
    members = await list_members(ctx.org_id)
    if any(m["email"] == email for m in members):
        raise ApiException(409, "That person is already a member.", "already_member", {"email": "Already a member of this organization."})
    if await Invitation.find_one({"org_id": ctx.org_id, "email": email, "status": "pending", "expires_at": {"$gt": datetime.utcnow()}}):
        raise ApiException(409, "An invitation is already pending for that email.", "already_invited", {"email": "An invitation is already pending."})
    inv = await create_invitation(ctx.org, ctx.user, email, body.role)
    return success_response(invitation_public(inv))


@router.patch("/team/members/{user_id}")
async def change_role(user_id: str, body: RoleIn, ctx: OrgContext = Depends(require_org("team:manage"))):
    m = await Membership.find_one({"org_id": ctx.org_id, "user_id": user_id})
    if not m:
        raise not_found("Member not found.")
    if user_id == str(ctx.user.id):
        raise ApiException(400, "You cannot change your own role.")
    if not can_manage_member(ctx.role, m.role) or body.role not in assignable_roles(ctx.role):
        raise forbidden("Your role cannot make this change.")
    if m.role == "owner" and body.role != "owner" and await Membership.find({"org_id": ctx.org_id, "role": "owner"}).count() == 1:
        raise ApiException(400, "An organization must keep at least one owner.")
    m.role = body.role
    await m.save()
    target = await load_user(user_id)
    await audit(ctx.org_id, ctx.user.full_name, f"Changed role of {target.email if target else user_id} to {body.role}")
    members = await list_members(ctx.org_id)
    return success_response(next(x for x in members if x["userId"] == user_id))


@router.delete("/team/members/{user_id}")
async def remove_member(user_id: str, ctx: OrgContext = Depends(require_org("team:manage"))):
    m = await Membership.find_one({"org_id": ctx.org_id, "user_id": user_id})
    if not m:
        raise not_found("Member not found.")
    if user_id == str(ctx.user.id):
        raise ApiException(400, "You cannot remove yourself.")
    if not can_manage_member(ctx.role, m.role):
        raise forbidden("Your role cannot remove this member.")
    if m.role == "owner" and await Membership.find({"org_id": ctx.org_id, "role": "owner"}).count() == 1:
        raise ApiException(400, "An organization must keep at least one owner.")
    await m.delete()
    await UserSession.find({"user_id": user_id, "org_id": ctx.org_id}).update({"$set": {"org_id": None}})
    for doc in await WorkspaceIncident.find({"org_id": ctx.org_id, "data.assigneeId": user_id}).to_list():
        doc.data = {**doc.data, "assigneeId": None}
        await doc.save()
    target = await load_user(user_id)
    await audit(ctx.org_id, ctx.user.full_name, f"Removed {target.email if target else user_id}")
    return success_response(None)


async def _pending_invitation(ctx: OrgContext, invitation_id: str) -> Invitation:
    inv = await Invitation.find_one({"_id": invitation_id, "org_id": ctx.org_id})
    if not inv:
        raise not_found("Invitation not found.")
    return inv


@router.delete("/team/invitations/{invitation_id}")
async def revoke_invitation(invitation_id: str, ctx: OrgContext = Depends(require_org("team:manage"))):
    inv = await _pending_invitation(ctx, invitation_id)
    inv.status = "revoked"
    inv.token_hash = hash_token(new_token())  # the emailed link stops working
    await inv.save()
    await audit(ctx.org_id, ctx.user.full_name, f"Revoked invitation for {inv.email}")
    return success_response(None)


@router.post("/team/invitations/{invitation_id}/resend")
async def resend_invitation(invitation_id: str, ctx: OrgContext = Depends(require_org("team:manage"))):
    inv = await _pending_invitation(ctx, invitation_id)
    if inv.status != "pending":
        raise ApiException(400, "Only pending invitations can be resent.")
    ratelimit.hit(f"invite-resend:{inv.id}", 3, 3600, "This invitation was resent too many times.")
    token = new_token(32)
    inv.token_hash = hash_token(token)  # the previous link stops working
    inv.expires_at = datetime.utcnow() + INVITE_TTL
    await inv.save()
    await send_invitation_email(inv, ctx.org, ctx.user, token)
    return success_response(None)


# ---------- API keys ----------

@router.post("/api-keys")
async def create_api_key(body: ApiKeyIn, ctx: OrgContext = Depends(require_org("apiKeys:manage"))):
    if await ApiKey.find(ApiKey.org_id == ctx.org_id).count() >= 25:
        raise ApiException(400, "Revoke an unused key before creating another (limit 25).")
    secret = f"vw_live_{new_token(32)}"
    key = ApiKey(org_id=ctx.org_id, name=body.name, prefix=secret[:14], key_hash=hash_token(secret), scopes=body.scopes, created_by=ctx.user.full_name)
    await key.insert()
    await audit(ctx.org_id, ctx.user.full_name, f'Created API key "{body.name}"')
    return success_response({"key": wsvc.api_key_public(key), "secret": secret})


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(key_id: str, ctx: OrgContext = Depends(require_org("apiKeys:manage"))):
    key = await ApiKey.find_one({"_id": key_id, "org_id": ctx.org_id})
    if not key:
        raise not_found("API key not found.")
    await key.delete()
    await audit(ctx.org_id, ctx.user.full_name, f'Revoked API key "{key.name}"')
    return success_response(None)


# ---------- public ----------

@public.post("/contact")
async def contact(body: ContactIn, request: Request):
    ratelimit.hit(f"contact:{client_ip(request)}", 5, 3600, "Too many messages. Try again later.")
    msg = ContactMessage(**body.model_dump())
    delivered = False
    if settings.CONTACT_INBOX:
        delivered = await send_email(
            settings.CONTACT_INBOX, f"[VaultWatch contact] {body.subject}",
            f"From: {body.name} <{body.email}>\nCompany: {body.company or '-'}\n\n{body.message}",
        )
    msg.delivered = delivered
    await msg.insert()  # stored either way so nothing is lost while email is not configured
    return success_response({"delivered": delivered})


@public.get("/dev/mail")
async def dev_mail():
    """Development-only mailbox for the console email backend. Disabled in every other environment."""
    if not settings.is_development or settings.EMAIL_BACKEND == "smtp":
        raise not_found()
    rows = await DevMail.find_all().sort("-created_at").limit(50).to_list()
    return success_response([
        {"id": str(m.id), "to": m.to, "subject": m.subject, "body": m.body, "link": m.link, "createdAt": iso(m.created_at)} for m in rows
    ])
