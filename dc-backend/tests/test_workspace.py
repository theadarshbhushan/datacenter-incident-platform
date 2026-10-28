from app.models.account import Membership
from tests.conftest import PASSWORD, last_link, signup_verified, token_from

ONBOARD = {
    "organization": {"name": "Acme DC", "size": "51-200", "industry": "Colocation provider"},
    "infrastructure": {"dataCenterName": "Mumbai-1", "environmentName": "Production", "serverCount": 40, "environmentType": "hybrid"},
    "monitoringMode": "demo",
    "invites": [{"email": "eng@acme.io", "role": "engineer"}],
}


async def onboarded_owner(b, email="owner@acme.io", company="Acme"):
    await signup_verified(b, email, company)
    r = await b.post("/onboarding/complete", ONBOARD)
    assert r.status_code == 200, r.text
    return r.json()["data"]


async def join(make_browser, email, name="New Person"):
    b = await make_browser()
    token = token_from(await last_link(email, "/accept-invitation"))
    look = (await b.post("/invitations/lookup", {"token": token})).json()["data"]
    assert look["state"] == "valid" and look["details"]["accountExists"] is False
    r = await b.post("/invitations/accept", {"token": token, "account": {"name": name, "password": PASSWORD}})
    assert r.status_code == 200, r.text
    return b, r.json()["data"]


async def test_onboarding_draft_and_demo_workspace(browser):
    await signup_verified(browser, "owner@acme.io")
    assert (await browser.get("/onboarding/draft")).json()["data"] is None
    await browser.put("/onboarding/draft", {"step": 2, "draft": {"organization": {"name": "Acme DC"}}})
    assert (await browser.get("/onboarding/draft")).json()["data"]["step"] == 2
    session = (await browser.post("/onboarding/complete", ONBOARD)).json()["data"]
    assert session["user"]["onboardingCompleted"] and session["organization"]["name"] == "Acme DC"
    ws = (await browser.get("/workspace")).json()["data"]
    assert ws["sample"] is True and len(ws["servers"]) == 40 and len(ws["incidents"]) >= 39
    assert all(i["sample"] for i in ws["incidents"]) and all(s["sample"] for s in ws["servers"])
    assert ws["dataCenters"][0]["name"] == "Mumbai-1"
    # Demo predictions come from the real model running on synthetic telemetry, and are labeled.
    assert ws["model"]["ready"] is True and ws["model"]["sample"] is False and ws["model"]["version"].startswith("vw-anomaly-")
    assert ws["predictions"] and all(p["sample"] for p in ws["predictions"])
    hot = next(s for s in ws["servers"] if s["hostname"] == "ash-a02-03")
    hot_pred = next(p for p in ws["predictions"] if p["serverId"] == hot["id"] and p["kind"] == "anomaly")
    assert hot_pred["severity"] in ("warning", "critical") and hot_pred["probability"] is None and 0 <= hot_pred["anomalyScore"] <= 1
    assert ws["telemetry"]["status"] == "demo"
    assert any(i["email"] == "eng@acme.io" for i in ws["invitations"])
    assert (await browser.get("/onboarding/draft")).json()["data"] is None


async def test_incident_lifecycle(browser):
    await onboarded_owner(browser)
    ws = (await browser.get("/workspace")).json()["data"]
    me = ws["members"][0]["userId"]
    srv = ws["servers"][0]
    numbers = [int(i["id"].rsplit("-", 1)[1]) for i in ws["incidents"]]
    r = await browser.post("/workspace/incidents", {"title": "Fan failure in A01", "description": "", "severity": "major", "category": "hardware", "rackId": srv["rackId"], "serverIds": [srv["id"]], "assigneeId": me})
    inc = r.json()["data"]
    assert int(inc["id"].rsplit("-", 1)[1]) == max(numbers) + 1 and inc["dcId"] == srv["dcId"]
    assert inc["analysis"]["generatedBy"] == "rules" and inc["analysis"]["rootCauseStatus"] in ("suspected", "unknown")
    bad = {"title": "Ghost server", "severity": "minor", "category": "network", "serverIds": ["srv_not_mine"]}
    assert (await browser.post("/workspace/incidents", bad)).status_code == 400
    path = f"/workspace/incidents/{inc['id']}/actions"
    assert (await browser.post(path, {"type": "acknowledge"})).json()["data"]["status"] == "investigating"
    assert (await browser.post(path, {"type": "comment", "message": "Swapping fan"})).status_code == 200
    resolved = (await browser.post(path, {"type": "resolve", "note": "Fan replaced"})).json()["data"]
    assert resolved["status"] == "resolved" and resolved["resolvedAt"]
    assert (await browser.post(path, {"type": "resolve"})).status_code == 400
    assert (await browser.post(path, {"type": "reopen", "reason": "Recurred"})).json()["data"]["status"] == "ongoing"
    assert (await browser.post(path, {"type": "explode"})).status_code == 422
    assert (await browser.post(path, {"type": "assign", "userId": "someone-else"})).status_code == 400


async def test_role_enforcement_on_server(browser, make_browser):
    await onboarded_owner(browser)
    eng, session = await join(make_browser, "eng@acme.io", "Eng One")
    assert session["role"] == "engineer" and session["user"]["emailVerified"]
    # Engineers can work incidents and alerts...
    alert = next(a for a in (await eng.get("/workspace")).json()["data"]["alerts"] if a["status"] == "active")
    assert (await eng.post(f"/workspace/alerts/{alert['id']}/actions", {"type": "acknowledge"})).status_code == 200
    # ...but not manage the team, rules, keys, billing or organization.
    assert (await eng.post("/team/invitations", {"email": "x@acme.io", "role": "viewer"})).status_code == 403
    assert (await eng.put("/workspace/alert-rules/new", {"name": "Hot", "metric": "temperature", "operator": ">", "threshold": 70, "durationMin": 5, "severity": "warning", "enabled": True, "channels": ["email"]})).status_code == 403
    assert (await eng.post("/api-keys", {"name": "agent", "scopes": ["metrics:write"]})).status_code == 403
    assert (await eng.post("/org/plan", {"plan": "business"})).status_code == 403
    assert (await eng.patch("/org", {"name": "Hacked"})).status_code == 403
    # Owner promotes to viewer; viewer cannot write incidents.
    eng_id = session["user"]["id"]
    assert (await browser.patch(f"/team/members/{eng_id}", {"role": "viewer"})).json()["data"]["role"] == "viewer"
    r = await eng.post("/workspace/incidents", {"title": "Should fail", "severity": "minor", "category": "network"})
    assert r.status_code == 403


async def test_admin_limits_and_last_owner(browser, make_browser):
    owner = await onboarded_owner(browser)
    await browser.post("/team/invitations", {"email": "admin@acme.io", "role": "admin"})
    admin, s = await join(make_browser, "admin@acme.io", "Ad Min")
    owner_id = owner["user"]["id"]
    assert (await admin.post("/team/invitations", {"email": "o2@acme.io", "role": "owner"})).status_code == 403
    assert (await admin.patch(f"/team/members/{owner_id}", {"role": "viewer"})).status_code == 403
    assert (await admin.delete(f"/team/members/{owner_id}")).status_code == 403
    assert (await browser.patch(f"/team/members/{owner_id}", {"role": "admin"})).status_code == 400  # own role
    dup = await admin.post("/team/invitations", {"email": "eng@acme.io", "role": "engineer"})
    assert dup.status_code == 409 and dup.json()["fields"]["email"]
    assert (await browser.delete(f"/team/members/{s['user']['id']}")).status_code == 200
    assert (await admin.get("/workspace")).json()["code"] == "no_org"


async def test_cross_organization_isolation(browser, make_browser):
    await onboarded_owner(browser)
    acme_ws = (await browser.get("/workspace")).json()["data"]
    other = await make_browser()
    await signup_verified(other, "boss@globex.io", "Globex")
    globex = (await other.get("/workspace")).json()["data"]
    assert globex["incidents"] == [] and globex["servers"] == [] and globex["sample"] is False
    acme_inc = acme_ws["incidents"][0]["id"]
    assert (await other.post(f"/workspace/incidents/{acme_inc}/actions", {"type": "comment", "message": "hi"})).status_code == 404
    acme_org = (await browser.get("/auth/session")).json()["data"]["organization"]["id"]
    assert (await other.post("/orgs/switch", {"orgId": acme_org})).status_code == 403
    acme_owner = acme_ws["members"][0]["userId"]
    assert (await other.delete(f"/team/members/{acme_owner}")).status_code == 404
    inv = acme_ws["invitations"][0]["id"]
    assert (await other.delete(f"/team/invitations/{inv}")).status_code == 404
    assert await Membership.find({"org_id": acme_org}).count() == 1


async def test_invitation_revoke_and_resend(browser, make_browser):
    await onboarded_owner(browser)
    first = token_from(await last_link("eng@acme.io", "/accept-invitation"))
    inv = (await browser.get("/workspace")).json()["data"]["invitations"][0]
    assert (await browser.post(f"/team/invitations/{inv['id']}/resend")).status_code == 200
    second = token_from(await last_link("eng@acme.io", "/accept-invitation"))
    b = await make_browser()
    assert (await b.post("/invitations/lookup", {"token": first})).json()["data"]["state"] == "invalid"
    assert (await b.post("/invitations/lookup", {"token": second})).json()["data"]["state"] == "valid"
    assert (await browser.delete(f"/team/invitations/{inv['id']}")).status_code == 200
    assert (await b.post("/invitations/lookup", {"token": second})).json()["data"]["state"] == "invalid"


async def test_existing_user_must_sign_in_to_accept(browser, make_browser):
    await onboarded_owner(browser)
    other = await make_browser()
    await signup_verified(other, "eng2@acme.io", "Solo")
    await browser.post("/team/invitations", {"email": "eng2@acme.io", "role": "engineer"})
    token = token_from(await last_link("eng2@acme.io", "/accept-invitation"))
    stranger = await make_browser()
    assert (await stranger.post("/invitations/accept", {"token": token})).json()["code"] == "wrong_account"
    s = (await other.post("/invitations/accept", {"token": token})).json()["data"]
    assert len(s["organizations"]) == 2 and s["organization"]["name"] == "Acme DC"
    s2 = (await other.post("/orgs/switch", {"orgId": [o for o in s["organizations"] if o["name"] == "Solo"][0]["id"]})).json()["data"]
    assert s2["role"] == "owner"


async def test_api_keys_and_ingestion(browser, make_browser):
    await signup_verified(browser, "owner@acme.io")
    later = {**ONBOARD, "monitoringMode": "connect", "invites": []}
    await browser.post("/onboarding/complete", later)
    created = (await browser.post("/api-keys", {"name": "agent", "scopes": ["metrics:write"]})).json()["data"]
    secret = created["secret"]
    assert secret.startswith("vw_live_") and secret not in str((await browser.get("/workspace")).json())
    sample = {"server_id": "srv-01", "hostname": "web-01", "cpu_pct": 42.1, "ram_pct": 61.0, "temp_celsius": 48.5}  # legacy format
    c = browser.c
    assert (await c.post("/api/v1/metrics", json=sample)).status_code in (401, 403)
    assert (await c.post("/api/v1/metrics", json=sample, headers={"X-API-Key": "vw_live_wrong"})).status_code == 401
    r = await c.post("/api/v1/metrics", json=sample, headers={"X-API-Key": secret})
    assert r.status_code == 201, r.text
    ws = (await browser.get("/workspace")).json()["data"]
    assert [s["hostname"] for s in ws["servers"]] == ["web-01"] and ws["servers"][0]["cpu"] == 42
    # Another organization never sees these servers.
    other = await make_browser()
    await signup_verified(other, "boss@globex.io", "Globex")
    assert (await other.get("/workspace")).json()["data"]["servers"] == []
    key_id = created["key"]["id"]
    assert (await other.delete(f"/api-keys/{key_id}")).status_code == 404
    assert (await browser.delete(f"/api-keys/{key_id}")).status_code == 200
    assert (await c.post("/api/v1/metrics", json=sample, headers={"X-API-Key": secret})).status_code == 401


async def test_resources_require_a_session(browser):
    for path in ("/servers", "/incidents", "/alerts", "/predictions", "/infrastructure", "/reports/summary", "/telemetry/health"):
        assert (await browser.get(path)).status_code == 401, path
    assert (await browser.c.get("/api/v1/analytics/summary")).status_code == 404  # the old pipeline-wide routes are gone


async def test_settings_rules_and_plan(browser):
    await onboarded_owner(browser)
    rule = {"name": "Hot", "metric": "temperature", "operator": ">", "threshold": 70, "durationMin": 5, "severity": "warning", "enabled": True, "channels": ["email"]}
    saved = (await browser.put("/workspace/alert-rules/new", rule)).json()["data"]
    assert saved["id"].startswith("rule_")
    assert (await browser.delete(f"/workspace/alert-rules/{saved['id']}")).status_code == 200
    ns = {"email": True, "slack": False, "webhook": True, "pagerduty": False, "slackChannel": "", "webhookUrl": "http://insecure", "quietHours": False, "minSeverity": "warning"}
    assert (await browser.put("/workspace/notification-settings", ns)).status_code == 422
    ns["webhookUrl"] = "https://hooks.example.com/x"
    assert (await browser.put("/workspace/notification-settings", ns)).status_code == 200
    org = (await browser.post("/org/plan", {"plan": "business"})).json()["data"]
    assert org["plan"] == "business"
    ws = (await browser.get("/workspace")).json()["data"]
    assert any("no charge" in a["action"] for a in ws["audit"])


async def test_contact_and_dev_mail(browser):
    r = await browser.post("/contact", {"name": "Ada", "email": "ada@acme.io", "company": "", "subject": "sales", "message": "Tell me about pricing please."})
    assert r.json()["data"] == {"delivered": False}
    assert (await browser.get("/dev/mail")).status_code == 200
