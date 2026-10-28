"""
Telemetry -> validation -> storage -> features -> model -> predictions -> alerts/incidents -> API,
using the real trained model artifact.
"""
from datetime import timedelta

import numpy as np

from app.core.timeutil import floor_to, iso, utcnow
from app.models.account import WorkspaceIncident
from app.models.monitoring import Prediction, TelemetryBucket, TelemetryPoint
from app.services import alerts as alert_svc
from tests.conftest import signup_verified
from tests.test_workspace import ONBOARD

LIVE = {**ONBOARD, "monitoringMode": "connect", "invites": []}


async def live_owner(b, email="owner@acme.io", company="Acme"):
    await signup_verified(b, email, company)
    assert (await b.post("/onboarding/complete", LIVE)).status_code == 200
    secret = (await b.post("/api-keys", {"name": "agent", "scopes": ["metrics:write"]})).json()["data"]["secret"]
    return secret


def history(server_id: str, hours: float = 5, spike_last: int = 0, spike_cpu: float = 97.0, rack="A01", seed=1, start_offset=0):
    """One point per 5 minutes ending now. The last `spike_last` buckets carry a CPU spike."""
    rng = np.random.default_rng(seed)
    base = floor_to(utcnow(), 300) - timedelta(minutes=5 * start_offset)
    n = int(hours * 12)
    pts = []
    for k in range(n, -1, -1):
        ts = base - timedelta(minutes=5 * k) + timedelta(seconds=20)
        cpu = spike_cpu + rng.normal(0, 1) if k <= spike_last else 30 + rng.normal(0, 2)
        pts.append({"serverId": server_id, "hostname": f"{server_id}.dc1", "rack": rack, "dataCenter": "Mumbai-1", "timestamp": iso(ts),
                    "metrics": {"cpu": round(float(min(100, max(0, cpu))), 2), "memory": round(float(50 + rng.normal(0, 1)), 2), "temperature": 45.0}})
    return pts


async def ingest(c, secret, points):
    return await c.post("/api/v1/telemetry/ingest", json={"points": points}, headers={"X-API-Key": secret})


async def test_ingestion_validation_and_persistence(browser):
    secret = await live_owner(browser)
    c = browser.c
    # No API key: refused (CSRF check for the cookie-carrying client, or 401 without cookies).
    assert (await c.post("/api/v1/telemetry/ingest", json={"serverId": "a", "metrics": {"cpu": 1}})).status_code in (401, 403)
    # Browser sessions cannot ingest even with a CSRF token.
    r = await browser.post("/telemetry/ingest", {"serverId": "a", "metrics": {"cpu": 1}})
    assert r.status_code == 401, r.text
    now = utcnow()
    bad = [
        {"serverId": "ok-1", "timestamp": iso(now + timedelta(hours=1)), "metrics": {"cpu": 10}},   # future
        {"serverId": "ok-1", "timestamp": iso(now - timedelta(days=3)), "metrics": {"cpu": 10}},    # too old
        {"serverId": "ok-1", "metrics": {}},                                                       # nothing to store
        {"serverId": "ok-1", "timestamp": iso(now), "metrics": {"cpu": 12.5, "temperature": 41}},  # valid
    ]
    r = await ingest(c, secret, bad)
    assert r.status_code == 202, r.text
    body = r.json()["data"]
    assert body["accepted"] == 1 and [x["index"] for x in body["rejected"]] == [0, 1, 2]
    # Schema validation: out-of-range values, unknown metrics and naive timestamps are refused outright.
    assert (await ingest(c, secret, [{"serverId": "x", "metrics": {"cpu": 140}}])).status_code == 422
    assert (await ingest(c, secret, [{"serverId": "x", "metrics": {"fanSpeed": 3}}])).status_code == 422
    assert (await ingest(c, secret, [{"serverId": "x", "timestamp": "2026-10-26T10:00:00", "metrics": {"cpu": 1}}])).status_code == 422
    assert (await ingest(c, secret, [{"serverId": "bad id!", "metrics": {"cpu": 1}}])).status_code == 422
    assert await TelemetryPoint.find_all().count() == 1 and await TelemetryBucket.find_all().count() == 1
    health = (await browser.get("/telemetry/health")).json()["data"]
    assert health["status"] == "live" and health["acceptedLastHour"] == 1 and health["rejectedLastHour"] == 3 and health["serversReporting"] == 1
    ws = (await browser.get("/workspace")).json()["data"]
    srv = ws["servers"][0]
    assert srv["agentId"] == "ok-1" and srv["cpu"] == 12 and srv["memory"] is None and srv["sample"] is False
    assert ws["dataCenters"][0]["name"] == "Mumbai-1" and ws["telemetry"]["status"] == "live"


async def test_not_live_before_telemetry(browser):
    await live_owner(browser)
    ws = (await browser.get("/workspace")).json()["data"]
    assert ws["telemetry"]["status"] == "waiting" and ws["servers"] == [] and ws["predictions"] == []
    run = await browser.post("/predictions/run", {})
    assert run.status_code == 200 and run.json()["data"]["scored"] == 0


async def test_model_scores_ingested_telemetry_and_opens_one_incident(browser):
    secret = await live_owner(browser)
    c = browser.c
    r = await ingest(c, secret, history("web-01", spike_last=3))
    assert r.status_code == 202 and r.json()["data"]["assessed"] == 1, r.text
    preds = (await browser.get("/predictions")).json()["data"]
    assert preds["model"]["ready"] and preds["model"]["version"].startswith("vw-anomaly-")
    anomaly = next(p for p in preds["predictions"] if p["kind"] == "anomaly")
    early = next(p for p in preds["predictions"] if p["kind"] == "early_warning")
    # Schema: affected server, type, scores kept apart, horizon, severity, factors, version, timestamp.
    assert anomaly["metric"] == "cpu" and anomaly["severity"] == "critical" and anomaly["horizon"] == "now"
    assert anomaly["probability"] is None and anomaly["anomalyScore"] > 0.95 and anomaly["factors"][0]["metric"] == "cpu"
    assert anomaly["confidence"] in ("low", "medium") and "baseline" in anomaly["confidenceReason"]
    assert early["horizon"] == "1h" and early["experimental"] is True and early["riskScore"] is not None
    assert anomaly["sample"] is False and anomaly["generatedAt"] and anomaly["modelVersion"] == preds["model"]["version"]
    one = (await browser.get(f"/predictions/{anomaly['id']}")).json()["data"]
    assert one["id"] == anomaly["id"]
    # Risk assessment -> alert -> automatic incident with suspected (not confirmed) root cause.
    alerts = (await browser.get("/alerts")).json()["data"]
    assert any(a["title"].startswith("CPU anomaly") for a in alerts)
    incs = (await browser.get("/incidents?status=active")).json()["data"]
    assert len(incs) == 1 and incs[0]["source"] in ("ai", "rule") and incs[0]["category"] == "capacity"
    analysis = incs[0]["analysis"]
    assert analysis["rootCauseStatus"] == "suspected" and analysis["generatedBy"] == "rules" and analysis["evidence"]
    # The same condition again does not open a second incident or alert (deduplication).
    more = history("web-01", hours=0.1, spike_last=5, seed=2, start_offset=-1)
    await ingest(c, secret, more)
    await browser.post("/predictions/run", {})
    assert len((await browser.get("/incidents?status=active")).json()["data"]) == 1
    keys = [a["title"] for a in (await browser.get("/alerts?status=active")).json()["data"]]
    assert len(keys) == len(set(keys))
    # Prediction log keeps history; only the newest per server and kind is current.
    log = (await browser.get("/predictions?history=true&kind=anomaly")).json()["data"]["predictions"]
    assert len(log) >= 2 and sum(p["current"] for p in log) == 1
    assert await Prediction.find({"current": True}).count() == 2


async def test_rack_correlation_joins_existing_incident(browser):
    secret = await live_owner(browser)
    await ingest(browser.c, secret, history("web-01", spike_last=3, rack="B02", seed=3))
    await ingest(browser.c, secret, history("web-02", spike_last=3, rack="B02", seed=4))
    incs = (await browser.get("/incidents?status=active")).json()["data"]
    assert len(incs) == 1 and len(incs[0]["serverIds"]) == 2
    assert any("Correlated" in e["message"] for e in incs[0]["timeline"])


async def test_incident_rest_lifecycle_and_report_consistency(browser):
    secret = await live_owner(browser)
    await ingest(browser.c, secret, history("db-01", spike_last=3))
    srv = (await browser.get("/servers")).json()["data"][0]
    created = await browser.post("/incidents", {"title": "Disk latency on db-01", "description": "p99 up", "severity": "critical",
                                                "category": "storage", "serverIds": [srv["id"]], "rackId": "", "assigneeId": None})
    assert created.status_code == 201
    iid = created.json()["data"]["id"]
    detail = (await browser.get(f"/incidents/{iid}")).json()["data"]
    assert detail["incident"]["id"] == iid and detail["metrics"]["points"] and detail["logs"]["connected"] is False
    report = (await browser.get("/reports/summary")).json()["data"]
    assert report["incidents"]["created"] == 2 and report["incidents"]["activeNow"] == 2 and report["incidents"]["resolved"] == 0
    assert 0 <= report["uptime"]["estimated"] <= 1 and report["servers"]["total"] == 1
    p = await browser.patch(f"/incidents/{iid}", {"acknowledged": True, "severity": "major"})
    assert p.json()["data"]["status"] == "investigating" and p.json()["data"]["severity"] == "major"
    r = await browser.patch(f"/incidents/{iid}", {"status": "resolved", "resolutionNote": "Replaced disk", "rootCause": "Failing SSD in slot 2"})
    data = r.json()["data"]
    assert data["status"] == "resolved" and data["analysis"]["rootCauseStatus"] == "confirmed"
    assert [e["type"] for e in data["timeline"]][-3:] == ["status", "resolved", "ai"] or "resolved" in [e["type"] for e in data["timeline"]]
    report = (await browser.get("/reports/summary")).json()["data"]
    assert report["incidents"]["resolved"] == 1 and report["incidents"]["activeNow"] == 1 and report["incidents"]["mttrMinutes"] is not None
    stored = await WorkspaceIncident.find({"status": "resolved"}).count()
    assert stored == report["incidents"]["resolved"]
    assert (await browser.patch(f"/incidents/{iid}", {})).status_code == 422
    assert (await browser.patch(f"/incidents/{iid}", {"severity": "apocalyptic"})).status_code == 422


async def test_new_endpoints_are_isolated_between_organizations(browser, make_browser):
    secret = await live_owner(browser)
    await ingest(browser.c, secret, history("web-01", spike_last=3))
    srv = (await browser.get("/servers")).json()["data"][0]
    inc = (await browser.get("/incidents")).json()["data"][0]
    pred = (await browser.get("/predictions")).json()["data"]["predictions"][0]
    alert = (await browser.get("/alerts")).json()["data"][0]
    other = await make_browser()
    await signup_verified(other, "boss@globex.io", "Globex")
    for path in (f"/servers/{srv['id']}", f"/servers/{srv['id']}/metrics", f"/incidents/{inc['id']}", f"/predictions/{pred['id']}"):
        assert (await other.get(path)).status_code == 404, path
    assert (await other.get("/servers")).json()["data"] == [] and (await other.get("/alerts")).json()["data"] == []
    assert (await other.get("/predictions")).json()["data"]["predictions"] == []
    assert (await other.patch(f"/incidents/{inc['id']}", {"severity": "minor"})).status_code == 404
    assert (await other.post(f"/alerts/{alert['id']}/actions", {"type": "dismiss"})).status_code == 404
    assert (await other.delete(f"/servers/{srv['id']}")).status_code == 404
    assert (await other.post("/predictions/run", {"serverIds": [srv["id"]]})).json()["data"]["servers"] == 0
    rep = (await other.get("/reports/summary")).json()["data"]
    assert rep["incidents"]["created"] == 0 and rep["servers"]["total"] == 0


async def test_infrastructure_management_and_permissions(browser, make_browser):
    await live_owner(browser)
    dc = (await browser.post("/datacenters", {"name": "Pune-2", "location": "Pune"})).json()["data"]
    rack = (await browser.post("/racks", {"dcId": dc["id"], "label": "R01"})).json()["data"]
    assert (await browser.post("/racks", {"dcId": dc["id"], "label": "R01"})).status_code == 409
    assert (await browser.post("/racks", {"dcId": "dc_nope", "label": "R02"})).status_code == 404
    srv = (await browser.post("/servers", {"agentId": "edge-1", "hostname": "edge-1", "rackId": rack["id"]})).json()["data"]
    assert srv["dcId"] == dc["id"] and srv["connectivity"] == "offline" and srv["cpu"] is None
    assert (await browser.post("/servers", {"agentId": "edge-1", "hostname": "dup"})).status_code == 409
    assert (await browser.delete(f"/racks/{rack['id']}")).status_code == 409   # not empty
    assert (await browser.patch(f"/servers/{srv['id']}", {"hostname": "edge-01"})).json()["data"]["hostname"] == "edge-01"
    inv = (await browser.get("/infrastructure")).json()["data"]
    assert {d["name"] for d in inv["dataCenters"]} == {"Mumbai-1", "Pune-2"} and inv["racks"][0]["powerKw"] is None
    await browser.post("/team/invitations", {"email": "view@acme.io", "role": "viewer"})
    from tests.test_workspace import join

    viewer, _ = await join(make_browser, "view@acme.io", "Vee")
    assert (await viewer.get("/infrastructure")).status_code == 200
    assert (await viewer.post("/datacenters", {"name": "Nope"})).status_code == 403
    assert (await viewer.post("/predictions/run", {})).status_code == 403
    assert (await viewer.patch(f"/servers/{srv['id']}", {"hostname": "x"})).status_code == 403
    assert (await browser.delete(f"/servers/{srv['id']}")).status_code == 200
    assert (await browser.delete(f"/racks/{rack['id']}")).status_code == 200
    assert (await browser.delete(f"/datacenters/{dc['id']}")).status_code == 200


async def test_alert_rules_fire_once_and_record_notifications(browser):
    secret = await live_owner(browser)
    rules = (await browser.get("/alert-rules")).json()["data"]
    assert {r["name"] for r in rules} >= {"High CPU", "Overheating"}
    await ingest(browser.c, secret, history("web-01", spike_last=3))
    await alert_svc.wait_for_deliveries()
    rule_alerts = [a for a in (await browser.get("/alerts")).json()["data"] if a["ruleId"]]
    assert len(rule_alerts) == 1 and rule_alerts[0]["title"].startswith("High CPU")
    log = (await browser.get("/notifications")).json()["data"]
    # Slack is selected on the default CPU rule but no webhook is configured: recorded honestly, not "sent".
    assert {"email", "slack"} <= {n["channel"] for n in log}
    assert next(n for n in log if n["channel"] == "slack")["status"] == "not_configured"
    assert next(n for n in log if n["channel"] == "email")["status"] in ("logged_only", "sent")
    a = rule_alerts[0]
    assert (await browser.post(f"/alerts/{a['id']}/actions", {"type": "acknowledge"})).json()["data"]["status"] == "acknowledged"
    assert (await browser.post(f"/alerts/{a['id']}/actions", {"type": "acknowledge"})).status_code == 400


async def test_demo_data_is_separate_and_removed_by_real_telemetry(browser):
    await signup_verified(browser, "owner@acme.io")
    await browser.post("/onboarding/complete", ONBOARD)  # demo mode
    ws = (await browser.get("/workspace")).json()["data"]
    assert ws["sample"] and all(s["sample"] for s in ws["servers"])
    report = (await browser.get("/reports/summary")).json()["data"]
    assert report["sample"] is True
    secret = (await browser.post("/api-keys", {"name": "agent", "scopes": ["metrics:write"]})).json()["data"]["secret"]
    # Loading sample data again is refused once real servers exist; real telemetry removes the sample first.
    r = await browser.c.post("/api/v1/telemetry/ingest", json={"serverId": "real-1", "metrics": {"cpu": 20}}, headers={"X-API-Key": secret})
    assert r.status_code == 202
    ws = (await browser.get("/workspace")).json()["data"]
    assert not ws["sample"] and [s["agentId"] for s in ws["servers"]] == ["real-1"]
    assert all(not i.get("sample") for i in ws["incidents"]) and ws["telemetry"]["status"] == "live"
    assert (await browser.post("/workspace/sample-environment")).status_code == 409


async def test_health_readiness_and_ml_status(browser):
    await live_owner(browser)
    live = await browser.c.get("/health")
    assert live.status_code == 200 and live.json()["data"]["modelReady"] is True
    st = (await browser.get("/ml/status")).json()["data"]
    assert st["ready"] and st["anomalyThresholds"]["critical"] > st["anomalyThresholds"]["warning"]
    assert st["evaluation"]["anomaly_loso_alert_rule"]["windows_total"] == 11
    integ = (await browser.get("/integrations/status")).json()["data"]
    assert integ["slack"]["configured"] is False and integ["email"]["delivers"] is False and integ["model"]["ready"]
