"""
The inference flow for one server:

    complete 5-minute buckets -> features -> anomaly + early-warning models -> prediction storage
    -> server assessment -> alerts (deduplicated) -> automatic incidents (deduplicated, correlated)
    -> alert-rule evaluation -> websocket notification to the organization's browsers

Called when a bucket closes during ingestion, by POST /predictions/run, and by the demo top-up.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional

import numpy as np
from loguru import logger

from app.core.timeutil import floor_to, utcnow
from app.ml import features as F
from app.ml.inference import METRIC_INFO, RECOMMENDATIONS, MetricResult, confidence_for, fmt, registry
from app.models.account import OrgWorkspace
from app.models.monitoring import METRICS, Factor, Prediction, Server, TelemetryBucket
from app.services import alerts as alert_svc
from app.services import incidents as incident_svc

BUCKET = timedelta(seconds=F.BUCKET_SECONDS)
HISTORY = F.BASELINE + 4                      # buckets read per scoring run
RULE_METRIC = {"cpu": "cpu", "memory": "memory", "temperature": "temperature", "power": "power", "latency": "latency", "storage": "storage"}


async def load_series(org_id: str, server_id: str, end: datetime) -> Dict[str, np.ndarray]:
    """Bucket means for buckets (end - HISTORY*5min, end], aligned on the 5-minute grid; gaps are NaN."""
    start = end - BUCKET * (HISTORY - 1)
    rows = await TelemetryBucket.find({"org_id": org_id, "server_id": server_id, "start": {"$gte": start, "$lte": end}}).to_list()
    grid = {start + BUCKET * i: i for i in range(HISTORY)}
    out = {m: np.full(HISTORY, np.nan) for m in METRICS}
    for b in rows:
        i = grid.get(b.start)
        if i is None:
            continue
        for m in METRICS:
            v = b.mean(m)
            if v is not None:
                out[m][i] = v
    # Only metrics the server actually reports.
    return {m: v for m, v in out.items() if not np.isnan(v).all()}


async def score_if_bucket_closed(org_id: str, server: Server) -> int:
    """Score the most recent complete bucket once. Returns 1 if a scoring run happened."""
    if not server.last_seen:
        return 0
    latest_complete = floor_to(server.last_seen, F.BUCKET_SECONDS) - BUCKET
    if server.last_scored_bucket and server.last_scored_bucket >= latest_complete:
        return 0
    await score_server(org_id, server, latest_complete)
    return 1


def _factors(results: List[MetricResult], key: str) -> List[Factor]:
    ranked = sorted(results, key=lambda r: -(getattr(r, key) or 0))[:4]
    return [Factor(label=METRIC_INFO[r.metric]["label"], metric=r.metric,
                   value=f"{fmt(r.metric, r.current)} (24h median {fmt(r.metric, r.median)})", weight=round(float(getattr(r, key) or 0), 3))
            for r in ranked]


async def _store(pred: Prediction) -> Prediction:
    await Prediction.find({"org_id": pred.org_id, "server_id": pred.server_id, "kind": pred.kind, "current": True}).update({"$set": {"current": False}})
    await pred.insert()
    return pred


async def score_server(org_id: str, server: Server, bucket: datetime, demo: Optional[bool] = None) -> Optional[Prediction]:
    demo = server.demo if demo is None else demo
    if not registry.ready:
        logger.warning(f"Skipping scoring for {server.id}: {registry.error}")
        return None
    series = await load_series(org_id, server.id, bucket)
    assessment = registry.assess(series) if series else None
    now = utcnow()
    server.last_scored_bucket = bucket
    if not assessment or not assessment.scored:
        server.assessment.severity, server.assessment.at, server.assessment.bucket = "insufficient_data", now, bucket
        server.assessment.anomaly_score, server.assessment.primary_metric = None, None
        await server.save()
        return None

    results = assessment.metrics
    primary = max(results, key=lambda r: r.anomaly_score)
    critical = [r for r in results if r.sustained_critical]
    severity = "critical" if critical else "warning" if any(r.level != "normal" for r in results) else "normal"
    conf, reason = confidence_for(primary)
    info = METRIC_INFO[primary.metric]
    details = [{"metric": r.metric, "anomalyScore": r.anomaly_score, "riskScore": r.risk_score, "current": r.current, "median": r.median,
                "level": r.level, "sustainedCritical": r.sustained_critical, "coverage": r.coverage} for r in results]
    anomaly = await _store(Prediction(
        org_id=org_id, server_id=server.id, rack_id=server.rack_id, dc_id=server.dc_id, kind="anomaly",
        # When nothing is flagged, the top-scoring metric is still recorded but the result is not called an anomaly.
        type=info["type"] if severity != "normal" else "No anomaly", category=info["category"], metric=primary.metric, severity=severity,
        anomaly_score=primary.anomaly_score,
        horizon="now", confidence=conf, confidence_reason=reason, factors=_factors(results, "anomaly_score"), details=details,
        recommendation=RECOMMENDATIONS.get(info["category"], ""), model_version=registry.version, bucket_start=bucket,
        generated_at=now, demo=demo,
    ))

    ew_cfg = registry.early_warning
    ew_pred = None
    with_risk = [r for r in results if r.risk_score is not None]
    if ew_cfg and with_risk:
        top = max(with_risk, key=lambda r: r.risk_score)
        ew_info = METRIC_INFO[top.metric]
        calibrated = bool(ew_cfg["probability_is_calibrated"])
        ew_conf, ew_reason = confidence_for(top)
        ew_pred = await _store(Prediction(
            org_id=org_id, server_id=server.id, rack_id=server.rack_id, dc_id=server.dc_id, kind="early_warning",
            type=f"{ew_info['label']} surge", category=ew_info["category"], metric=top.metric,
            severity="warning" if top.risk_score >= ew_cfg["threshold"] else "normal",
            risk_score=top.risk_score, probability=top.risk_score if calibrated else None, probability_calibrated=calibrated,
            horizon="1h", confidence=ew_conf, confidence_reason=ew_reason, factors=_factors(with_risk, "risk_score"), details=details,
            recommendation=f"Watch {ew_info['label'].lower()} on this server over the next hour. {RECOMMENDATIONS.get(ew_info['category'], '')}",
            model_version=registry.version, experimental=True, bucket_start=bucket, generated_at=now,
            expected_at=bucket + BUCKET + timedelta(hours=1), demo=demo,
        ))

    server.assessment.at, server.assessment.bucket, server.assessment.severity = now, bucket, severity
    server.assessment.anomaly_score, server.assessment.primary_metric, server.assessment.model_version = primary.anomaly_score, primary.metric, registry.version
    await server.save()

    await _anomaly_alerts(org_id, server, results, demo)
    await _rule_alerts(org_id, server, bucket, series, demo)
    if critical:
        await _auto_incident(org_id, server, critical, demo)
    from app.websocket.manager import ws_manager

    await ws_manager.broadcast({"type": "assessment", "data": {"serverId": server.id, "severity": severity}}, org_id)
    return anomaly


async def _monitoring(org_id: str) -> dict:
    ws = await OrgWorkspace.get(org_id)
    return (ws.monitoring if ws else {}) or {}


async def _anomaly_alerts(org_id: str, server: Server, results: List[MetricResult], demo: bool) -> None:
    for r in results:
        key = f"anomaly:{server.id}:{r.metric}"
        label = METRIC_INFO[r.metric]["label"]
        if r.sustained_critical:
            await alert_svc.raise_alert(
                org_id, key, f"{label} anomaly on {server.hostname}",
                f"{label} at {fmt(r.metric, r.current)} vs 24h median {fmt(r.metric, r.median)}; anomaly score {r.anomaly_score:.2f} for 15+ minutes.",
                "critical" if METRIC_INFO[r.metric]["validated"] else "warning", server.id, None, [], demo=demo,
            )
        elif r.level == "normal":
            await alert_svc.clear_alert(org_id, key, f"{label} back within its normal range.")


def _rule_holds(values: np.ndarray, op: str, threshold: float, n: int) -> Optional[bool]:
    tail = values[-n:]
    if len(tail) < n or np.isnan(tail).any():
        return None
    return bool(np.all(tail > threshold) if op == ">" else np.all(tail < threshold))


async def _rule_alerts(org_id: str, server: Server, bucket: datetime, series: Dict[str, np.ndarray], demo: bool) -> None:
    monitoring = await _monitoring(org_id)
    for rule in await alert_svc.list_rules(org_id):
        metric = RULE_METRIC.get(rule.metric)
        if not rule.enabled or metric not in series:
            continue
        n = max(1, -(-rule.duration_min // 5))
        holds = _rule_holds(series[metric], rule.operator, rule.threshold, n)
        key = f"rule:{rule.id}:{server.id}"
        if holds:
            unit = METRIC_INFO[metric]["unit"]
            created = await alert_svc.raise_alert(
                org_id, key, f"{rule.name} on {server.hostname}",
                f"{METRIC_INFO[metric]['label']} {rule.operator} {rule.threshold:g}{unit} for {rule.duration_min} min (now {fmt(metric, float(series[metric][-1]))}).",
                rule.severity, server.id, rule.id, rule.channels, demo=demo,
            )
            if created and rule.severity == "critical" and monitoring.get("autoCreateIncidents", True):
                await incident_svc.on_signal(
                    org_id, server, METRIC_INFO[metric]["category"], "major", "rule", f"{rule.name} on {server.hostname}",
                    f"Alert rule \"{rule.name}\" fired: {created['message']}", f"rule \"{rule.name}\" fired", demo=demo,
                )
        elif holds is False:
            await alert_svc.clear_alert(org_id, key, "condition no longer met.")


async def _auto_incident(org_id: str, server: Server, critical: List[MetricResult], demo: bool) -> None:
    if not (await _monitoring(org_id)).get("autoCreateIncidents", True):
        return
    top = max(critical, key=lambda r: r.anomaly_score)
    info = METRIC_INFO[top.metric]
    # Two or more metrics critical at once, or a hard saturation limit, is treated as critical; one metric as major.
    from app.services.infrastructure import health

    severity = "critical" if len(critical) >= 2 or health(server) == "critical" else "major"
    names = ", ".join(METRIC_INFO[r.metric]["label"] for r in critical)
    await incident_svc.on_signal(
        org_id, server, info["category"], severity, "ai", f"{info['type']} on {server.hostname}",
        f"Anomaly detection flagged {names} on {server.hostname} for at least 15 minutes. "
        f"{info['label']} is {fmt(top.metric, top.current)} against a 24-hour median of {fmt(top.metric, top.median)}.",
        f"{names} anomalous (score {top.anomaly_score:.2f})", demo=demo,
    )


async def run_for_org(org_id: str, server_ids: Optional[List[str]] = None) -> dict:
    """Score every (or the given) server's latest complete bucket, even if it was already scored."""
    q = {"org_id": org_id}
    if server_ids:
        q["_id"] = {"$in": server_ids}
    servers = await Server.find(q).to_list()
    scored = skipped = 0
    for s in servers:
        if not s.last_seen:
            skipped += 1
            continue
        bucket = floor_to(min(s.last_seen, utcnow()), F.BUCKET_SECONDS) - BUCKET
        pred = await score_server(org_id, s, bucket)
        scored += 1 if pred else 0
        skipped += 0 if pred else 1
    return {"servers": len(servers), "scored": scored, "skipped": skipped, "modelVersion": registry.version}
