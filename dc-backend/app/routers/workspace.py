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
from app.core.timeutil import iso
from app.core.tokens import hash_token, new_token
from app.models.account import ApiKey, ContactMessage, DevMail, Invitation, Membership, UserSession, WorkspaceIncident
from app.schemas.account import ApiKeyIn, ContactIn, InviteIn, RoleIn
from app.schemas.response import success_response
from app.schemas.workspace import AlertActionIn, AlertRuleIn, IncidentAction, MonitoringIn, NewIncidentIn, NotificationSettingsIn
from app.services import alerts as alert_svc
from app.services import demo as demo_svc
from app.services import incidents as incident_svc
from app.services import workspace as wsvc
from app.services.accounts import INVITE_TTL, audit, create_invitation, invitation_public, list_members, normalize_email, send_invitation_email

router = APIRouter(tags=["Workspace"])
public = APIRouter(tags=["Public"])


@router.get("/workspace", summary="Everything the app shell needs for the caller's organization, in one call")
async def get_workspace(ctx: OrgContext = Depends(require_org())):
    return success_response(await wsvc.full_workspace(ctx))


# The routes below predate the REST resources (/incidents, /alerts, /alert-rules, ...) and call the same services.

@router.post("/workspace/incidents")
async def create_incident(body: NewIncidentIn, ctx: OrgContext = Depends(require_org("incident:write"))):
    inc = await incident_svc.create_manual(ctx.org_id, ctx.user.full_name, body)
    await audit(ctx.org_id, ctx.user.full_name, f"Created {inc['id']}")
    return success_response(inc)


@router.post("/workspace/incidents/{incident_id}/actions")
async def incident_action(
    incident_id: str,
    action: Annotated[IncidentAction, Field(discriminator="type")] = Body(...),
    ctx: OrgContext = Depends(require_org("incident:write")),
):
    inc = await incident_svc.apply_action(ctx.org_id, incident_id, ctx.user.full_name, action)
    await audit(ctx.org_id, ctx.user.full_name, f"{action.type} {incident_id}")
    return success_response(inc)


@router.post("/workspace/alerts/{alert_id}/actions")
async def alert_action(alert_id: str, body: AlertActionIn, ctx: OrgContext = Depends(require_org("alert:act"))):
    return success_response(await alert_svc.act(ctx.org_id, alert_id, body.type, ctx.user.full_name))


@router.put("/workspace/alert-rules/{rule_id}")
async def save_alert_rule(rule_id: str, body: AlertRuleIn, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    rule = await alert_svc.save_rule(ctx.org_id, rule_id, body)
    await audit(ctx.org_id, ctx.user.full_name, f'Saved alert rule "{rule.name}"')
    return success_response(alert_svc.rule_public(rule))


@router.delete("/workspace/alert-rules/{rule_id}")
async def delete_alert_rule(rule_id: str, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    from app.models.monitoring import AlertRule

    await AlertRule.find({"_id": rule_id, "org_id": ctx.org_id}).delete()
    await audit(ctx.org_id, ctx.user.full_name, "Deleted an alert rule")
    return success_response(None)


@router.put("/workspace/notification-settings")
async def update_notifications(body: NotificationSettingsIn, ctx: OrgContext = Depends(require_org("alertRules:manage"))):
    ws = await wsvc.ensure_settings(ctx.org_id)
    ws.notification_settings = body.model_dump()
    await ws.save()
    await audit(ctx.org_id, ctx.user.full_name, "Updated notification settings")
    return success_response(ws.notification_settings)


@router.put("/workspace/monitoring")
async def update_monitoring(body: MonitoringIn, ctx: OrgContext = Depends(require_org("monitoring:manage"))):
    ws = await wsvc.ensure_settings(ctx.org_id)
    ws.monitoring = body.model_dump()
    await ws.save()
    await audit(ctx.org_id, ctx.user.full_name, "Updated monitoring settings")
    return success_response(ws.monitoring)


@router.post("/workspace/sample-environment", summary="Load the labeled sample environment (refused when real servers exist)")
async def load_sample(ctx: OrgContext = Depends(require_org("infra:manage"))):
    await wsvc.ensure_settings(ctx.org_id)
    await demo_svc.seed(ctx.org, ctx.user.full_name)
    ctx.org.monitoring_mode = "demo"
    await ctx.org.save()
    await audit(ctx.org_id, ctx.user.full_name, "Loaded sample environment")
    return success_response(None)


@router.delete("/workspace/sample-environment", summary="Remove every sample row; real data is not touched")
async def remove_sample(ctx: OrgContext = Depends(require_org("infra:manage"))):
    if not await demo_svc.has_demo(ctx.org_id):
        raise ApiException(404, "This organization has no sample data.", "not_found")
    await demo_svc.clear(ctx.org, ctx.user.full_name)
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
        await doc.sync().save()
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
