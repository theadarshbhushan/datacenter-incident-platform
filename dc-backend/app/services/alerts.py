"""
Alerts, alert rules and notification delivery.

An alert is raised once per condition (dedup_key) and updated while the condition persists; it is
resolved automatically when the condition clears. Notifications record what really happened for each
channel: "sent", "failed", "not_configured", "logged_only" (console email backend) or "suppressed".
"""
from __future__ import annotations

import asyncio
from typing import List, Optional

import httpx
from loguru import logger

from app.core.config import settings
from app.core.mailer import send_email
from app.core.timeutil import iso, utcnow
from app.models.account import Membership, OrgWorkspace, WorkspaceAlert, new_id
from app.models.monitoring import AlertRule, Notification
from app.models.user import User

SEVERITY_RANK = {"info": 0, "warning": 1, "critical": 2}
RULE_METRICS = {"cpu": "cpu", "memory": "memory", "temperature": "temperature", "power": "power", "latency": "latency", "storage": "storage"}


def rule_public(r: AlertRule) -> dict:
    t = r.threshold
    return {"id": r.id, "name": r.name, "metric": r.metric, "operator": r.operator, "threshold": int(t) if float(t).is_integer() else t,
            "durationMin": r.duration_min, "severity": r.severity, "enabled": r.enabled, "channels": r.channels}


async def list_rules(org_id: str) -> List[AlertRule]:
    return await AlertRule.find(AlertRule.org_id == org_id).sort("+position").to_list()


async def save_rule(org_id: str, rule_id: str, body) -> AlertRule:
    existing = await AlertRule.find_one({"_id": rule_id, "org_id": org_id}) if rule_id != "new" else None
    if rule_id != "new" and not existing:
        from app.core.errors import not_found

        raise not_found("Alert rule not found.")
    if existing:
        r = existing
    else:
        if await AlertRule.find(AlertRule.org_id == org_id).count() >= 100:
            from app.core.errors import ApiException

            raise ApiException(400, "Delete an unused rule before adding another (limit 100).")
        last = await AlertRule.find(AlertRule.org_id == org_id).sort("-position").first_or_none()
        r = AlertRule(org_id=org_id, name=body.name, metric=body.metric, operator=body.operator, threshold=body.threshold,
                      position=(last.position + 1) if last else 0)
    r.name, r.metric, r.operator, r.threshold = body.name, body.metric, body.operator, body.threshold
    r.duration_min, r.severity, r.enabled, r.channels = body.durationMin, body.severity, body.enabled, list(body.channels)
    await r.save()
    return r


def alert_public(doc: WorkspaceAlert) -> dict:
    d = dict(doc.data)
    d.setdefault("sample", doc.demo)
    d.setdefault("lastSeenAt", iso(doc.last_seen_at) if doc.last_seen_at else d.get("createdAt"))
    return d


async def raise_alert(org_id: str, key: str, title: str, message: str, severity: str, server_id: Optional[str], rule_id: Optional[str],
                      channels: List[str], demo: bool = False) -> Optional[dict]:
    """Create the alert for `key` unless an unresolved one exists (then refresh it). Returns the alert if newly created."""
    now = utcnow()
    existing = await WorkspaceAlert.find_one({"org_id": org_id, "dedup_key": key, "status": {"$in": ["active", "acknowledged"]}})
    if existing:
        data = dict(existing.data)
        data["message"] = message
        if SEVERITY_RANK.get(severity, 0) > SEVERITY_RANK.get(data["severity"], 0):
            data["severity"] = severity
        existing.data, existing.last_seen_at = data, now
        await existing.sync().save()
        return None
    data = {"id": new_id("alt_"), "title": title, "message": message, "severity": severity, "status": "active", "serverId": server_id,
            "ruleId": rule_id, "createdAt": iso(now), "acknowledgedBy": None, "sample": demo}
    doc = WorkspaceAlert(org_id=org_id, alert_id=data["id"], created_at=now, data=data, dedup_key=key, last_seen_at=now, demo=demo).sync()
    await doc.insert()
    if not demo:
        await dispatch(org_id, data, channels)
    return data


async def clear_alert(org_id: str, key: str, note: str) -> None:
    for doc in await WorkspaceAlert.find({"org_id": org_id, "dedup_key": key, "status": {"$in": ["active", "acknowledged"]}}).to_list():
        data = dict(doc.data)
        data["status"], data["message"] = "resolved", f"{data['message']} Cleared: {note}"
        doc.data = data
        await doc.sync().save()


async def act(org_id: str, alert_id: str, action: str, actor: str) -> dict:
    from app.core.errors import ApiException, not_found

    doc = await WorkspaceAlert.find_one({"org_id": org_id, "alert_id": alert_id})
    if not doc:
        raise not_found("Alert not found.")
    data = dict(doc.data)
    if data["status"] in ("resolved", "dismissed") and action != "reopen":
        raise ApiException(400, f"This alert is already {data['status']}.")
    if action == "acknowledge":
        if data["status"] == "acknowledged":
            raise ApiException(400, "This alert is already acknowledged.")
        data["status"], data["acknowledgedBy"], data["acknowledgedAt"] = "acknowledged", actor, iso(utcnow())
    elif action == "resolve":
        data["status"] = "resolved"
    else:
        data["status"] = "dismissed"
    doc.data = data
    await doc.sync().save()
    return alert_public(doc)


# ---------- notifications ----------

def _quiet_now() -> bool:
    h = utcnow().hour
    return h >= 22 or h < 7


async def dispatch(org_id: str, alert: dict, channels: List[str]) -> None:
    ws = await OrgWorkspace.get(org_id)
    ns = (ws.notification_settings if ws else {}) or {}
    wanted = channels or [c for c in ("email", "slack", "webhook", "pagerduty") if ns.get(c)]
    if not wanted:
        return
    if SEVERITY_RANK.get(alert["severity"], 0) < SEVERITY_RANK.get(ns.get("minSeverity", "warning"), 1):
        for c in wanted:
            await Notification(org_id=org_id, alert_id=alert["id"], channel=c, status="suppressed", detail="Below the minimum severity.").insert()
        return
    if ns.get("quietHours") and alert["severity"] != "critical" and _quiet_now():
        for c in wanted:
            await Notification(org_id=org_id, alert_id=alert["id"], channel=c, status="suppressed", detail="Quiet hours (22:00-07:00 UTC).").insert()
        return
    # Deliver in the background so ingestion is never blocked by a slow channel.
    task = asyncio.create_task(_deliver(org_id, alert, wanted, ns))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


_tasks: set = set()


async def _deliver(org_id: str, alert: dict, channels: List[str], ns: dict) -> None:
    text = f"[{alert['severity'].upper()}] {alert['title']}: {alert['message']}"
    for channel in channels:
        status, detail = "not_configured", ""
        try:
            if channel == "email":
                if not ns.get("email"):
                    status, detail = "not_configured", "Email notifications are turned off in notification settings."
                else:
                    ids = [m.user_id for m in await Membership.find({"org_id": org_id, "role": {"$in": ["owner", "admin"]}}).to_list()]
                    from beanie import PydanticObjectId

                    users = await User.find({"_id": {"$in": [PydanticObjectId(i) for i in ids]}}).to_list()
                    delivered = [await send_email(u.email, f"VaultWatch alert: {alert['title']}", text, "/app/alerts") for u in users]
                    status = "sent" if delivered and all(delivered) else "logged_only" if settings.EMAIL_BACKEND != "smtp" else "failed"
                    detail = f"{len(users)} recipient(s)"
            elif channel == "webhook":
                url = ns.get("webhookUrl", "")
                if not ns.get("webhook") or not url:
                    detail = "Webhook is off or has no URL."
                else:
                    status, detail = await _post(url, {"type": "alert", "alert": alert})
            elif channel == "slack":
                if not settings.SLACK_WEBHOOK_URL:
                    detail = "Set SLACK_WEBHOOK_URL on the backend to deliver Slack messages."
                else:
                    status, detail = await _post(settings.SLACK_WEBHOOK_URL, {"text": text})
            elif channel == "pagerduty":
                if not settings.PAGERDUTY_ROUTING_KEY:
                    detail = "Set PAGERDUTY_ROUTING_KEY on the backend to page through PagerDuty."
                else:
                    status, detail = await _post("https://events.pagerduty.com/v2/enqueue", {
                        "routing_key": settings.PAGERDUTY_ROUTING_KEY, "event_action": "trigger", "dedup_key": alert["id"],
                        "payload": {"summary": text[:1000], "source": "vaultwatch", "severity": "critical" if alert["severity"] == "critical" else "warning"},
                    })
        except Exception as e:  # never let a channel failure break the pipeline
            status, detail = "failed", type(e).__name__
            logger.warning(f"Notification via {channel} failed for alert {alert['id']}: {e}")
        await Notification(org_id=org_id, alert_id=alert["id"], channel=channel, status=status, detail=detail[:300]).insert()


async def _post(url: str, payload: dict) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(url, json=payload)
    return ("sent", f"HTTP {r.status_code}") if r.status_code < 300 else ("failed", f"HTTP {r.status_code}")


async def wait_for_deliveries() -> None:
    """Used by tests and shutdown."""
    if _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)
