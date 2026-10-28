"""
Move the embedded workspace arrays into collections.

- Sample workspaces: the old sample inventory, predictions and alerts are dropped and the sample
  environment is rebuilt with real telemetry-driven predictions (app.services.demo). Resolved sample
  incident history is kept.
- Real workspaces: data centers and alert rules move to their collections (rule ids are re-issued and
  alerts are re-pointed). Servers that reported with an API key move from the legacy `servers`
  collection to `infra_servers`, and their last 7 days of legacy `metrics` become 5-minute buckets.
- Finally the legacy fields are removed from org_workspaces. The legacy `servers` and `metrics`
  collections are left untouched (nothing is deleted).
"""
from datetime import timedelta

from loguru import logger

from app.core.timeutil import floor_to, utcnow
from app.models.account import Organization, WorkspaceAlert, new_id
from app.models.monitoring import AlertRule, DataCenter, Rack, Server, TelemetryBucket

LEGACY_FIELDS = {"data_centers": "", "racks": "", "servers": "", "predictions": "", "model": "", "alert_rules": "", "sample": ""}
METRIC_MAP = {"cpu_pct": "cpu", "ram_pct": "memory", "disk_io_mbps": "disk_io", "net_mbps": "network", "temp_celsius": "temperature", "disk_used_pct": "storage"}


async def run(db) -> None:
    from app.services import demo

    async for ws in db["org_workspaces"].find({}):
        org_id = ws["_id"]
        org = await Organization.get(org_id)
        rule_ids = {}
        if not await AlertRule.find_one(AlertRule.org_id == org_id):
            for i, r in enumerate(ws.get("alert_rules") or []):
                rule = AlertRule(org_id=org_id, name=r["name"], metric=r["metric"], operator=r["operator"], threshold=r["threshold"],
                                 duration_min=r.get("durationMin", 5), severity=r["severity"], enabled=r.get("enabled", True),
                                 channels=r.get("channels", []), position=i)
                await rule.insert()
                rule_ids[r["id"]] = rule.id
        for a in await WorkspaceAlert.find({"org_id": org_id, "data.ruleId": {"$in": list(rule_ids)}}).to_list():
            a.data = {**a.data, "ruleId": rule_ids[a.data["ruleId"]]}
            await a.save()

        if ws.get("sample"):
            await WorkspaceAlert.find({"org_id": org_id, "demo": True}).delete()
            from app.models.account import WorkspaceIncident

            await WorkspaceIncident.find({"org_id": org_id, "demo": True, "status": {"$ne": "resolved"}}).delete()
            if org and not await Server.find_one({"org_id": org_id, "demo": False}):
                dc = (ws.get("data_centers") or [{}])[0]
                try:
                    await demo.seed(org, "VaultWatch", dc.get("name"), dc.get("environment"))
                except Exception as e:  # keep migrating other organizations
                    logger.warning(f"Could not rebuild the sample environment for {org_id}: {e}")
        else:
            for d in ws.get("data_centers") or []:
                if not await DataCenter.find_one({"org_id": org_id, "name": d["name"], "demo": False}):
                    await DataCenter(org_id=org_id, name=d["name"], location="" if d.get("location") == "—" else d.get("location", ""),
                                     environment=d.get("environment", "Production")).insert()
            await _move_agent_servers(db, org_id)
        await db["org_workspaces"].update_one({"_id": org_id}, {"$unset": LEGACY_FIELDS})


async def _move_agent_servers(db, org_id: str) -> None:
    since = utcnow() - timedelta(days=7)
    async for old in db["servers"].find({"org_id": org_id}):
        agent_id = old.get("agent_id") or old["server_id"].split("/", 1)[-1]
        if await Server.find_one({"org_id": org_id, "agent_id": agent_id}):
            continue
        dc = await DataCenter.find(DataCenter.org_id == org_id).sort("+created_at").first_or_none()
        if not dc:
            dc = DataCenter(org_id=org_id, name="Default data center")
            await dc.insert()
        rack = None
        if old.get("rack"):
            rack = await Rack.find_one({"org_id": org_id, "dc_id": dc.id, "label": old["rack"]})
            if not rack:
                rack = Rack(org_id=org_id, dc_id=dc.id, label=old["rack"], row=old["rack"][:1].upper())
                await rack.insert()
        srv = Server(id=new_id("srv_"), org_id=org_id, agent_id=agent_id, hostname=old.get("hostname") or agent_id,
                     ip="" if old.get("ip_address") == "—" else old.get("ip_address", ""), dc_id=dc.id, rack_id=rack.id if rack else None,
                     role=old.get("hardware_type", "compute"), source="agent", first_seen=old.get("created_at"), last_seen=old.get("last_seen"))
        await srv.insert()
        buckets = {}
        async for m in db["metrics"].find({"server_id": old["server_id"], "timestamp": {"$gte": since}}):
            start = floor_to(m["timestamp"], 300)
            b = buckets.setdefault(start, {"sums": {}, "counts": {}, "maxes": {}})
            for src, dst in METRIC_MAP.items():
                if m.get(src) is not None:
                    b["sums"][dst] = b["sums"].get(dst, 0) + m[src]
                    b["counts"][dst] = b["counts"].get(dst, 0) + 1
                    b["maxes"][dst] = max(b["maxes"].get(dst, m[src]), m[src])
        if buckets:
            await TelemetryBucket.insert_many([TelemetryBucket(org_id=org_id, server_id=srv.id, start=s, **v) for s, v in sorted(buckets.items())])
            last = buckets[max(buckets)]
            for k, total in last["sums"].items():
                setattr(srv.latest, k, total / last["counts"][k])
            await srv.save()
