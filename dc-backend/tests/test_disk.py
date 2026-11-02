"""SMART readings -> storage -> disk model -> predictions -> alerts, using the real disk model artifact."""
import importlib.util
from datetime import timedelta
from pathlib import Path

import numpy as np

from app.core.timeutil import iso, utcnow
from app.ml import disk_features as D
from app.models.account import WorkspaceAlert, WorkspaceIncident
from app.models.monitoring import DiskHealth, Prediction
from tests.test_monitoring import ingest, live_owner

HEALTHY = {"5": 0, "9": 20000, "187": 0, "188": 0, "194": 30, "197": 0, "198": 0}
FAILING = {"5": 4000, "9": 40000, "187": 400, "188": 30, "194": 38, "197": 2000, "198": 2000}


def point(smart, serial="ZA1", at=None, server="disk-01"):
    return {"serverId": server, "hostname": f"{server}.dc1", "rack": "A01", "dataCenter": "Mumbai-1", "timestamp": iso(at or utcnow()),
            "metrics": {"cpu": 20.0}, "disks": [{"device": "/dev/sda", "serial": serial, "model": "ST4000DM000", "smart": smart}]}


def test_features_handle_missing_counters_and_packed_temperature():
    now = {a: np.array([np.nan]) for a in D.SMART_ATTRS} | {5: np.array([10.0]), 194: np.array([25 + (40 << 16) + 256.0 * 0])}
    before = {a: np.array([np.nan]) for a in D.SMART_ATTRS}
    row = dict(zip(D.FEATURE_NAMES, D.feature_matrix(now, before)[0]))
    assert row["log_smart_197"] == -1 and row["age_years"] == -1
    assert row["temperature_c"] == 25
    assert row["log_delta_5"] == 0
    assert row["error_attrs_nonzero"] == 1


async def test_failing_drive_scores_above_healthy_and_alerts_once(browser):
    secret = await live_owner(browser)
    c = browser.c
    assert (await ingest(c, secret, [point(HEALTHY)])).status_code == 202
    healthy = await Prediction.find_one({"kind": "disk_failure", "current": True})
    assert healthy.severity == "normal" and healthy.horizon == "30d" and healthy.confidence == "medium"
    assert healthy.details[0]["serial"] == "ZA1"

    drive = await DiskHealth.find_one({"serial": "ZA1"})
    drive.anchor_at -= timedelta(days=8)    # the counters jump within a week, which is what reaches critical
    await drive.save()
    for _ in range(2):
        assert (await ingest(c, secret, [point(FAILING)])).status_code == 202
    failing = await Prediction.find_one({"kind": "disk_failure", "current": True})
    assert failing.severity == "critical" and failing.risk_score > healthy.risk_score
    assert failing.experimental and failing.probability is None
    assert any(f.label == "Pending sectors" for f in failing.factors)
    alerts = await WorkspaceAlert.find({"dedup_key": {"$regex": "^disk:.*:ZA1$"}}).to_list()
    assert len(alerts) == 1 and alerts[0].data["status"] == "active"
    assert await WorkspaceIncident.find({"org_id": alerts[0].org_id}).count() == 0

    assert (await ingest(c, secret, [point(HEALTHY)])).status_code == 202
    alert = await WorkspaceAlert.find_one({"dedup_key": {"$regex": "^disk:.*:ZA1$"}})
    assert alert.data["status"] == "resolved"

    listed = (await browser.get("/predictions?kind=disk_failure")).json()["data"]
    assert len(listed["predictions"]) == 1 and listed["model"]["diskFailure"]["ready"]


async def test_week_old_reading_feeds_the_change_features(browser):
    secret = await live_owner(browser)
    assert (await ingest(browser.c, secret, [point(HEALTHY)])).status_code == 202
    drive = await DiskHealth.find_one({"serial": "ZA1"})
    drive.anchor_at -= timedelta(days=8)    # ingestion refuses points this old, so age the stored reading
    await drive.save()
    assert (await ingest(browser.c, secret, [point(FAILING)])).status_code == 202
    drive = await DiskHealth.find_one({"serial": "ZA1"})
    assert drive.previous_smart["197"] == 0 and drive.smart["197"] == 2000
    latest = await Prediction.find_one({"kind": "disk_failure", "current": True})
    assert latest.confidence == "high" and any("this week" in f.value for f in latest.factors)


async def test_invalid_smart_is_rejected_and_other_orgs_cannot_see_drives(browser, make_browser):
    secret = await live_owner(browser)
    bad = point(HEALTHY)
    bad["disks"][0]["smart"] = {"5": -1}
    assert (await ingest(browser.c, secret, [bad])).status_code == 422
    assert (await ingest(browser.c, secret, [point(FAILING)])).status_code == 202
    other = await make_browser()
    await live_owner(other, "owner@globex.io", "Globex")
    assert (await other.get("/predictions?kind=disk_failure")).json()["data"]["predictions"] == []


def test_agent_reports_only_sata_hard_drives():
    path = Path(__file__).resolve().parents[2] / "dc-ingestion" / "agent.py"
    spec = importlib.util.spec_from_file_location("vaultwatch_agent", path)
    agent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(agent)
    table = [{"id": 5, "raw": {"value": 3}}, {"id": 197, "raw": {"value": 1}}]
    hdd = {"serial_number": "S1", "model_name": "ST4000DM000", "rotation_rate": 7200, "ata_smart_attributes": {"table": table}}
    assert agent.parse_drive(hdd, "/dev/sda")["smart"] == {"5": 3, "197": 1}
    assert agent.parse_drive({**hdd, "rotation_rate": 0}, "/dev/sdb") is None
    assert agent.parse_drive({"serial_number": "N1", "nvme_smart_health_information_log": {}}, "/dev/nvme0") is None
