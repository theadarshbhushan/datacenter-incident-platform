"""Authentication, invitations, profile, organization switching and onboarding."""
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response

from app.core import ratelimit
from app.core.auth import (
    AuthContext, OrgContext, client_ip, csrf_token_valid, current_auth, end_all_sessions, end_session, hash_password,
    new_csrf_token, require_org, require_user, set_csrf_cookie, start_session, verify_password, CSRF_COOKIE,
)
from app.core.errors import ApiException, forbidden, not_found
from app.core.mailer import send_email
from app.core.passwords import validate_new_password
from app.models.account import Invitation, Membership, OnboardingDraft, Organization, UserSession
from app.models.user import User
from app.schemas.account import (
    AcceptInviteIn, ChangePasswordIn, DraftIn, LoginIn, OnboardingIn, OptionalEmailIn, OrgPatch, PlanIn, ProfilePatch,
    ResetIn, SignupIn, SwitchOrgIn, TokenIn, EmailIn,
)
from app.schemas.response import success_response
from app.services import workspace as wsvc
from app.services.accounts import (
    AVATAR_COLORS, RESET_TTL, audit, build_session, create_invitation, find_auth_token, find_invitation, invitation_public,
    issue_auth_token, new_organization, normalize_email, org_public, send_verification, user_public,
)
from app.services.sample_data import iso

MIN = 60
auth = APIRouter(prefix="/auth", tags=["Authentication"])
invitations = APIRouter(prefix="/invitations", tags=["Invitations"])
me = APIRouter(prefix="/me", tags=["Profile"])
orgs = APIRouter(tags=["Organization"])


# ---------- session ----------

@auth.get("/csrf")
async def csrf(request: Request, response: Response):
    token = request.cookies.get(CSRF_COOKIE)
    if not csrf_token_valid(token):
        token = new_csrf_token()
        set_csrf_cookie(response, token)
    return success_response({"csrfToken": token})


@auth.get("/session")
async def get_session(ctx: AuthContext = Depends(require_user)):
    return success_response(await build_session(ctx))


@auth.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = normalize_email(body.email)
    fail_key, ip_key = f"login:{email}", f"login-ip:{client_ip(request)}"
    ratelimit.check(fail_key, 5, 15 * MIN, "Too many failed sign-in attempts. Try again in 15 minutes or reset your password.")
    ratelimit.hit(ip_key, 30, 15 * MIN, "Too many sign-in attempts from this network.")
    user = await User.find_one(User.email == email)
    if not verify_password(body.password, user.hashed_password if user else None) or not user or not user.is_active:
        ratelimit.record(fail_key, 15 * MIN)
        raise ApiException(401, "Incorrect email or password.", "invalid_credentials")
    ratelimit.clear(fail_key)
    if pwd_needs_update(user.hashed_password):
        user.hashed_password = hash_password(body.password)
        await user.save()
    await end_session(request, response)
    session = await start_session(request, response, user, body.remember)
    return success_response(await build_session(AuthContext(user=user, session=session)), "Signed in")


def pwd_needs_update(hashed: str) -> bool:
    from app.core.auth import pwd_context

    return pwd_context.needs_update(hashed)


@auth.post("/signup")
async def signup(body: SignupIn, request: Request):
    """Same response whether or not the email is registered; the emailed link continues the flow."""
    ratelimit.hit(f"signup:{client_ip(request)}", 10, 60 * MIN, "Too many sign-ups from this network.")
    validate_new_password(body.password)
    email = normalize_email(body.email)
    ratelimit.hit(f"signup-email:{email}", 3, 15 * MIN, "Too many attempts for this email address.")
    existing = await User.find_one(User.email == email)
    if existing:
        if not existing.email_verified:
            await send_verification(existing)
        else:
            await send_email(
                email, "You already have a VaultWatch account",
                "Someone tried to create a new account with this email address. If it was you, sign in instead, "
                "or reset your password if you have forgotten it.", "/login",
            )
        return success_response({"session": None, "verificationRequired": True})
    count = await User.count()
    user = User(
        email=email, hashed_password=hash_password(body.password), full_name=body.name, email_verified=False,
        avatar_color=AVATAR_COLORS[count % len(AVATAR_COLORS)], referral=body.ref,
    )
    await user.insert()
    org = await new_organization(body.company)
    await Membership(org_id=org.id, user_id=str(user.id), role="owner").insert()
    await wsvc.replace_with_empty(org.id)
    await send_verification(user)
    return success_response({"session": None, "verificationRequired": True})


@auth.post("/logout")
async def logout(request: Request, response: Response):
    await end_session(request, response)
    return success_response(None, "Signed out")


# ---------- password reset ----------

@auth.post("/password/forgot")
async def forgot_password(body: EmailIn, request: Request):
    email = normalize_email(body.email)
    ratelimit.hit(f"reset:{email}", 3, 15 * MIN, "Too many reset requests.")
    ratelimit.hit(f"reset-ip:{client_ip(request)}", 10, 15 * MIN, "Too many reset requests from this network.")
    user = await User.find_one(User.email == email)
    if user and user.is_active:
        token = await issue_auth_token("reset", user, RESET_TTL)
        await send_email(
            email, "Reset your VaultWatch password",
            "Use this link to choose a new password. It expires in 30 minutes and can be used once. "
            "If you did not ask for this, you can ignore this email.",
            f"/reset-password?token={token}",
        )
    # Identical response whether or not the account exists.
    return success_response(None, "If an account exists for that email, a reset link is on its way.")


@auth.post("/password/reset/check")
async def check_reset(body: TokenIn, request: Request):
    ratelimit.hit(f"token-ip:{client_ip(request)}", 30, 15 * MIN, "Too many attempts.")
    state, _ = await find_auth_token(body.token, "reset")
    return success_response({"state": state})


@auth.post("/password/reset")
async def reset_password(body: ResetIn, request: Request, response: Response):
    ratelimit.hit(f"token-ip:{client_ip(request)}", 30, 15 * MIN, "Too many attempts.")
    state, record = await find_auth_token(body.token, "reset")
    if state != "valid" or not record:
        raise ApiException(400, "This reset link has expired." if state == "expired" else "This reset link is invalid or has already been used.", f"token_{state}")
    validate_new_password(body.password)
    from app.core.auth import load_user

    user = await load_user(record.user_id)
    if not user:
        raise ApiException(400, "This reset link is invalid.", "token_invalid")
    record.used_at = datetime.utcnow()
    await record.save()
    user.hashed_password = hash_password(body.password)
    user.password_changed_at = datetime.utcnow()
    await user.save()
    await end_all_sessions(str(user.id))  # signs the account out everywhere
    ratelimit.clear(f"login:{user.email}")
    await end_session(request, response)
    await send_email(user.email, "Your VaultWatch password was changed", "If you did not do this, reset your password now and contact your administrator.")
    return success_response(None, "Password updated")


# ---------- email verification ----------

@auth.post("/email/verify")
async def verify_email(body: TokenIn, request: Request):
    ratelimit.hit(f"token-ip:{client_ip(request)}", 30, 15 * MIN, "Too many attempts.")
    state, record = await find_auth_token(body.token, "verify")
    from app.core.auth import load_user

    if state == "used" and record:
        u = await load_user(record.user_id)
        return success_response({"result": "already-verified" if u and u.email_verified else "invalid"})
    if state == "expired":
        return success_response({"result": "expired"})
    if state != "valid" or not record:
        return success_response({"result": "invalid"})
    user = await load_user(record.user_id)
    if not user:
        return success_response({"result": "invalid"})
    record.used_at = datetime.utcnow()
    await record.save()
    already = user.email_verified
    user.email_verified = True
    await user.save()
    return success_response({"result": "already-verified" if already else "verified"})


@auth.post("/email/resend")
async def resend_verification(body: OptionalEmailIn, request: Request):
    ctx = await current_auth(request)
    user = ctx.user if ctx else (await User.find_one(User.email == normalize_email(body.email)) if body.email else None)
    target = user.email if user else normalize_email(body.email) if body.email else client_ip(request)
    ratelimit.hit(f"verify:{target}", 3, 15 * MIN, "Too many verification emails requested.")
    if user and not user.email_verified:
        await send_verification(user)
    return success_response(None, "If your email still needs verifying, a new link is on its way.")


# ---------- invitations ----------

@invitations.post("/lookup")
async def lookup_invitation(body: TokenIn, request: Request):
    ratelimit.hit(f"token-ip:{client_ip(request)}", 30, 15 * MIN, "Too many attempts.")
    state, inv = await find_invitation(body.token)
    if state != "valid" or not inv:
        return success_response({"state": state})
    org = await Organization.get(inv.org_id)
    exists = await User.find_one(User.email == inv.email) is not None
    return success_response({"state": "valid", "details": {
        "invitation": invitation_public(inv), "organizationName": org.name if org else "Unknown organization",
        "inviterName": inv.invited_by, "accountExists": exists,
    }})


@invitations.post("/accept")
async def accept_invitation(body: AcceptInviteIn, request: Request, response: Response):
    ratelimit.hit(f"token-ip:{client_ip(request)}", 30, 15 * MIN, "Too many attempts.")
    state, inv = await find_invitation(body.token)
    if state != "valid" or not inv:
        raise ApiException(400, "This invitation is no longer valid.", f"token_{state}")
    ctx = await current_auth(request)
    user = await User.find_one(User.email == inv.email)
    if user:
        if not ctx or str(ctx.user.id) != str(user.id):
            raise ApiException(403, f"Sign in as {inv.email} to accept this invitation.", "wrong_account")
    else:
        if not body.account:
            raise ApiException(400, "Create an account to accept this invitation.", "account_required")
        validate_new_password(body.account.password)
        count = await User.count()
        # The invitation link proves control of the mailbox, so the email counts as verified.
        user = User(
            email=inv.email, hashed_password=hash_password(body.account.password), full_name=body.account.name,
            email_verified=True, onboarding_completed=True, avatar_color=AVATAR_COLORS[count % len(AVATAR_COLORS)],
        )
        await user.insert()
    if not await Membership.find_one({"org_id": inv.org_id, "user_id": str(user.id)}):
        await Membership(org_id=inv.org_id, user_id=str(user.id), role=inv.role).insert()
    user.onboarding_completed = True
    user.email_verified = True
    await user.save()
    inv.status = "accepted"
    await inv.save()
    await audit(inv.org_id, user.full_name, f"Joined as {inv.role}")
    if ctx and str(ctx.user.id) == str(user.id):
        ctx.session.org_id = inv.org_id
        await ctx.session.save()
        return success_response(await build_session(ctx))
    await end_session(request, response)
    session = await start_session(request, response, user, False, inv.org_id)
    return success_response(await build_session(AuthContext(user=user, session=session)))


@invitations.post("/decline")
async def decline_invitation(body: TokenIn, request: Request):
    ratelimit.hit(f"token-ip:{client_ip(request)}", 30, 15 * MIN, "Too many attempts.")
    state, inv = await find_invitation(body.token)
    if state != "valid" or not inv:
        raise ApiException(400, "This invitation is no longer valid.", f"token_{state}")
    inv.status = "declined"
    await inv.save()
    return success_response(None, "Invitation declined")


# ---------- profile ----------

@me.patch("")
async def update_profile(body: ProfilePatch, ctx: AuthContext = Depends(require_user)):
    u = ctx.user
    if body.name is not None:
        u.full_name = body.name
    if body.jobTitle is not None:
        u.job_title = body.jobTitle or None
    if body.avatarColor is not None:
        u.avatar_color = body.avatarColor
    if body.preferences is not None:
        u.preferences = {**(u.preferences or {}), **body.preferences.model_dump(exclude_none=True)}
    await u.save()
    return success_response(user_public(u))


@me.post("/password")
async def change_password(body: ChangePasswordIn, ctx: AuthContext = Depends(require_user)):
    ratelimit.hit(f"pwchange:{ctx.user.id}", 5, 15 * MIN, "Too many attempts.")
    if not verify_password(body.current, ctx.user.hashed_password):
        raise ApiException(400, "Your current password is incorrect.", "invalid_password", {"current": "Current password is incorrect."})
    validate_new_password(body.next, "next")
    ctx.user.hashed_password = hash_password(body.next)
    ctx.user.password_changed_at = datetime.utcnow()
    await ctx.user.save()
    await end_all_sessions(str(ctx.user.id), keep_session_id=ctx.session.id)
    return success_response(None, "Password changed")


@me.get("/sessions")
async def list_sessions(ctx: AuthContext = Depends(require_user)):
    rows = await UserSession.find(UserSession.user_id == str(ctx.user.id)).sort("-last_active").to_list()
    now = datetime.utcnow()
    return success_response([
        {"id": s.id, "device": s.device, "location": s.ip or "Unknown", "createdAt": iso(s.created_at), "lastActive": iso(s.last_active), "current": s.id == ctx.session.id}
        for s in rows if s.expires_at > now
    ])


@me.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, ctx: AuthContext = Depends(require_user)):
    target = await UserSession.find_one({"_id": session_id, "user_id": str(ctx.user.id)})
    if not target:
        raise not_found("Session not found.")
    if target.id == ctx.session.id:
        raise ApiException(400, "Use Sign out to end the current session.")
    await target.delete()
    return success_response(None, "Session revoked")


# ---------- organization & onboarding ----------

@orgs.post("/orgs/switch")
async def switch_org(body: SwitchOrgIn, ctx: AuthContext = Depends(require_user)):
    if not await Membership.find_one({"org_id": body.orgId, "user_id": str(ctx.user.id)}):
        raise forbidden("You are not a member of that organization.")
    ctx.session.org_id = body.orgId
    await ctx.session.save()
    return success_response(await build_session(ctx))


@orgs.put("/onboarding/draft")
async def save_draft(body: DraftIn, ctx: AuthContext = Depends(require_user)):
    if len(str(body.draft)) > 20000:
        raise ApiException(413, "Draft is too large.")
    d = await OnboardingDraft.find_one(OnboardingDraft.user_id == str(ctx.user.id)) or OnboardingDraft(user_id=str(ctx.user.id))
    d.step, d.draft, d.updated_at = body.step, body.draft, datetime.utcnow()
    await d.save()
    return success_response(None)


@orgs.get("/onboarding/draft")
async def get_draft(ctx: AuthContext = Depends(require_user)):
    d = await OnboardingDraft.find_one(OnboardingDraft.user_id == str(ctx.user.id))
    return success_response({"step": d.step, "draft": d.draft} if d else None)


@orgs.post("/onboarding/complete")
async def complete_onboarding(body: OnboardingIn, ctx: OrgContext = Depends(require_org())):
    if ctx.role != "owner":
        raise forbidden("Only the organization owner can complete setup.")
    org, user = ctx.org, ctx.user
    org.name, org.size, org.industry = body.organization.name, body.organization.size, body.organization.industry
    org.environment_type = body.infrastructure.environmentType
    org.monitoring_mode = body.monitoringMode
    await org.save()
    infra = body.infrastructure
    if body.monitoringMode == "demo":
        await wsvc.replace_with_sample(org.id, user.full_name, infra.dataCenterName, infra.environmentName)
    else:
        await wsvc.replace_with_empty(org.id, infra.dataCenterName, infra.environmentName)
    for inv in body.invites:
        email = normalize_email(inv.email)
        if inv.role == "owner" or email == user.email:
            continue
        if await Invitation.find_one({"org_id": org.id, "email": email, "status": "pending"}):
            continue
        await create_invitation(org, user, email, inv.role)
    await audit(org.id, user.full_name, "Completed onboarding")
    user.onboarding_completed = True
    await user.save()
    await OnboardingDraft.find(OnboardingDraft.user_id == str(user.id)).delete()
    return success_response(await build_session(AuthContext(user=user, session=ctx.session)))


@orgs.post("/onboarding/skip")
async def skip_onboarding(ctx: AuthContext = Depends(require_user)):
    ctx.user.onboarding_completed = True
    await ctx.user.save()
    await OnboardingDraft.find(OnboardingDraft.user_id == str(ctx.user.id)).delete()
    return success_response(await build_session(ctx))


@orgs.patch("/org")
async def update_org(body: OrgPatch, ctx: OrgContext = Depends(require_org("org:manage"))):
    o = ctx.org
    if body.name is not None:
        o.name = body.name
    if body.size is not None:
        o.size = body.size
    if body.industry is not None:
        o.industry = body.industry
    if body.environmentType is not None:
        o.environment_type = body.environmentType
    await o.save()
    await audit(o.id, ctx.user.full_name, "Updated organization settings")
    return success_response(org_public(o))


@orgs.post("/org/plan")
async def change_plan(body: PlanIn, ctx: OrgContext = Depends(require_org("billing:manage"))):
    """Records the selected plan only. No payment provider is configured, so nothing is charged."""
    from app.core.config import settings

    if settings.BILLING_PROVIDER:
        raise ApiException(501, "Billing provider checkout is not implemented in this build.", "billing_not_implemented")
    ctx.org.plan = body.plan
    await ctx.org.save()
    await audit(ctx.org.id, ctx.user.full_name, f"Changed plan to {body.plan} (no charge, billing not configured)")
    return success_response(org_public(ctx.org))
