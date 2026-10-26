from datetime import datetime, timedelta

from app.models.account import AuthToken, UserSession
from app.models.user import User
from tests.conftest import PASSWORD, last_link, signup_verified, token_from


async def test_csrf_required_for_cookie_writes(browser):
    r = await browser.c.post("/api/v1/auth/login", json={"email": "a@b.co", "password": "x"})
    assert r.status_code == 403 and r.json()["code"] == "csrf_failed"
    tok = await browser.token()
    r = await browser.c.post("/api/v1/auth/login", json={"email": "a@b.co", "password": "x"}, headers={"X-CSRF-Token": tok + "x"})
    assert r.json()["code"] == "csrf_failed"
    r = await browser.c.post("/api/v1/auth/login", json={"email": "a@b.co", "password": "x"}, headers={"X-CSRF-Token": tok, "Origin": "https://evil.example"})
    assert r.json()["code"] == "csrf_failed"


async def test_signup_does_not_sign_in_or_reveal_existing_accounts(browser):
    body = {"name": "Ada", "email": "ada@acme.io", "company": "Acme", "password": PASSWORD}
    first = await browser.post("/auth/signup", body)
    second = await browser.post("/auth/signup", {**body, "name": "Mallory"})
    assert first.status_code == second.status_code == 200
    assert first.json()["data"] == second.json()["data"] == {"session": None, "verificationRequired": True}
    assert (await browser.get("/auth/session")).status_code == 401
    assert await User.find(User.email == "ada@acme.io").count() == 1


async def test_weak_password_rejected(browser):
    r = await browser.post("/auth/signup", {"name": "Ada", "email": "ada@acme.io", "company": "Acme", "password": "short"})
    assert r.status_code == 422 and r.json()["fields"]["password"]


async def test_full_signup_verify_login_session_cookie(browser):
    session = await signup_verified(browser, "ada@acme.io")
    assert session["role"] == "owner" and session["user"]["emailVerified"] and session["mode"] == "api"
    assert session["organization"]["name"] == "Acme" and session["organization"]["plan"] == "trial"
    cookie = browser.c.cookies.get("vw_session")
    assert cookie and len(cookie) > 30
    # Only a hash of the session token is stored.
    stored = await UserSession.find_one({})
    assert stored.token_hash != cookie and len(stored.token_hash) == 64
    assert "hashed_password" not in str(session) and PASSWORD not in str(session)
    r = await browser.post("/auth/logout")
    assert r.status_code == 200
    assert (await browser.get("/auth/session")).status_code == 401


async def test_login_errors_are_generic_and_rate_limited(browser):
    await signup_verified(browser, "ada@acme.io")
    await browser.post("/auth/logout")
    wrong = await browser.post("/auth/login", {"email": "ada@acme.io", "password": "Wrong-password-1"})
    unknown = await browser.post("/auth/login", {"email": "nobody@acme.io", "password": "Wrong-password-1"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["message"] == unknown.json()["message"]
    for _ in range(4):
        await browser.post("/auth/login", {"email": "ada@acme.io", "password": "Wrong-password-1"})
    r = await browser.post("/auth/login", {"email": "ada@acme.io", "password": PASSWORD})
    assert r.status_code == 429 and r.json()["code"] == "rate_limited"


async def test_password_reset_single_use_and_expiring(browser, make_browser):
    await signup_verified(browser, "ada@acme.io")
    other = await make_browser()
    await other.post("/auth/login", {"email": "ada@acme.io", "password": PASSWORD})
    same_known = await browser.post("/auth/password/forgot", {"email": "ada@acme.io"})
    same_unknown = await browser.post("/auth/password/forgot", {"email": "ghost@acme.io"})
    assert same_known.json()["message"] == same_unknown.json()["message"]
    token = token_from(await last_link("ada@acme.io", "/reset-password"))
    assert (await browser.post("/auth/password/reset/check", {"token": token})).json()["data"]["state"] == "valid"
    r = await browser.post("/auth/password/reset", {"token": token, "password": "Brand-New-Pass-9"})
    assert r.status_code == 200
    assert (await browser.post("/auth/password/reset", {"token": token, "password": "Another-Pass-99"})).json()["code"] == "token_used"
    # All sessions were revoked, and the new password works.
    assert (await other.get("/auth/session")).status_code == 401
    assert (await browser.post("/auth/login", {"email": "ada@acme.io", "password": "Brand-New-Pass-9"})).status_code == 200
    # Expired tokens are refused.
    await browser.post("/auth/password/forgot", {"email": "ada@acme.io"})
    t2 = token_from(await last_link("ada@acme.io", "/reset-password"))
    rec = await AuthToken.find_one({"kind": "reset", "used_at": None})
    rec.expires_at = datetime.utcnow() - timedelta(minutes=1)
    await rec.save()
    assert (await browser.post("/auth/password/reset/check", {"token": t2})).json()["data"]["state"] == "expired"
    assert (await browser.post("/auth/password/reset/check", {"token": "nonsense-token"})).json()["data"]["state"] == "invalid"


async def test_forgot_password_rate_limited(browser):
    for _ in range(3):
        assert (await browser.post("/auth/password/forgot", {"email": "x@acme.io"})).status_code == 200
    assert (await browser.post("/auth/password/forgot", {"email": "x@acme.io"})).status_code == 429


async def test_change_password_and_sessions(browser, make_browser):
    await signup_verified(browser, "ada@acme.io")
    other = await make_browser()
    await other.post("/auth/login", {"email": "ada@acme.io", "password": PASSWORD})
    sessions = (await browser.get("/me/sessions")).json()["data"]
    assert len(sessions) == 2 and sum(s["current"] for s in sessions) == 1
    bad = await browser.post("/me/password", {"current": "nope", "next": "Brand-New-Pass-9"})
    assert bad.status_code == 400 and bad.json()["fields"]["current"]
    assert (await browser.post("/me/password", {"current": PASSWORD, "next": "Brand-New-Pass-9"})).status_code == 200
    assert (await other.get("/auth/session")).status_code == 401
    assert (await browser.get("/auth/session")).status_code == 200


async def test_profile_update(browser):
    await signup_verified(browser, "ada@acme.io")
    r = await browser.patch("/me", {"name": "Ada L.", "jobTitle": "SRE lead", "preferences": {"compactTables": True}})
    u = r.json()["data"]
    assert u["name"] == "Ada L." and u["jobTitle"] == "SRE lead" and u["preferences"]["compactTables"] is True


async def test_verification_link_states(browser):
    await browser.post("/auth/signup", {"name": "Ada", "email": "ada@acme.io", "company": "Acme", "password": PASSWORD})
    token = token_from(await last_link("ada@acme.io", "/verify-email"))
    assert (await browser.post("/auth/email/verify", {"token": token})).json()["data"]["result"] == "verified"
    assert (await browser.post("/auth/email/verify", {"token": token})).json()["data"]["result"] == "already-verified"
    assert (await browser.post("/auth/email/verify", {"token": "garbage-token"})).json()["data"]["result"] == "invalid"


async def test_errors_do_not_leak_internals(browser):
    r = await browser.post("/workspace/incidents", {"title": "x"})
    assert r.status_code == 401 and "Traceback" not in r.text
