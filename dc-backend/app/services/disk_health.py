"""
Disk-failure prediction for one server:

    SMART readings from the agent -> stored per drive -> disk model -> prediction storage
    -> alert when a drive reaches the critical level (deduplicated per drive)

The agent sends readings about once an hour. A server has one current "disk_failure" prediction,
for its riskiest drive; the other drives are listed in its details.

The model is experimental: on held-out drives most critical flags were still false alarms (see
DISK_MODEL_CARD.md). So it raises a warning alert for a person to check and never opens an incident.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import List

from app.core.timeutil import utcnow
from app.ml import disk_features as D
from app.ml.disk_inference import DiskResult, disk_registry
from app.models.monitoring import DiskHealth, Factor, Prediction, Server
from app.services import alerts as alert_svc

WEEK = timedelta(days=7)
RECOMMENDATION = "Check that this drive's data is backed up or redundant, and plan to replace the drive. Run a long SMART self-test to confirm."


async def record_readings(org_id: str, server: Server, readings: List, ts: datetime) -> List[DiskHealth]:
    """Store the latest reading of each drive, keeping a reading at least a week old to measure change."""
    drives = []
    for r in readings:
        smart = {str(k): float(v) for k, v in r.smart.items()}
        d = await DiskHealth.find_one({"org_id": org_id, "server_id": server.id, "serial": r.serial})
        if not d:
            d = DiskHealth(org_id=org_id, server_id=server.id, serial=r.serial, model=r.model, device=r.device,
                           anchor_at=ts, anchor_smart=smart, last_at=ts, smart=smart, demo=server.demo)
            await d.insert()
        elif ts >= d.last_at:
            if ts - d.anchor_at >= WEEK:
                d.previous_smart, d.anchor_at, d.anchor_smart = d.anchor_smart, ts, smart
            d.model, d.device, d.last_at, d.smart = r.model, r.device, ts, smart
            await d.save()
        drives.append(d)
    return drives


def _ints(smart: dict) -> dict:
    return {int(k): v for k, v in smart.items()}


def _factors(d: DiskHealth, result: DiskResult) -> List[Factor]:
    smart = _ints(d.smart)
    previous = _ints(d.previous_smart) if d.previous_smart else {}
    out = [Factor(label="Drive", value=f"{d.device} {d.model} ({d.serial})", weight=0.0)]
    for attr, label in D.ATTR_LABELS.items():
        value = smart.get(attr, 0.0)
        if value > 0:
            change = value - previous[attr] if attr in previous else 0.0
            out.append(Factor(label=label, metric="disk", value=f"{value:,.0f}" + (f" (+{change:,.0f} this week)" if change > 0 else ""),
                              weight=round(min(1.0, math.log1p(value) / math.log1p(1000)), 3)))
    if len(out) == 1:
        out.append(Factor(label="Error counters", metric="disk", value="All at zero", weight=0.0))
    if 9 in smart:
        out.append(Factor(label="Drive age", metric="disk", value=f"{smart[9] / D.HOURS_PER_YEAR:.1f} years", weight=0.0))
    return out


def _confidence(d: DiskHealth, result: DiskResult) -> tuple[str, str]:
    smart = _ints(d.smart)
    missing = [a for a in D.ERROR_ATTRS if a != 187 and a not in smart]
    if missing:
        return "low", "This drive does not report all the error counters the model uses."
    if not result.has_week_old_reading:
        return "medium", "No reading from a week ago yet, so recent change in the counters is unknown."
    return "high", "All key SMART counters reported, with a week-old reading to compare."


async def score_drives(org_id: str, server: Server, drives: List[DiskHealth], ts: datetime) -> Prediction | None:
    if not drives or not disk_registry.ready:
        return None
    from app.services.pipeline import _store

    results = disk_registry.assess([_ints(d.smart) for d in drives], [_ints(d.previous_smart) if d.previous_smart else None for d in drives])
    worst_i = max(range(len(results)), key=lambda i: results[i].risk)
    drive, top = drives[worst_i], results[worst_i]
    conf, reason = _confidence(drive, top)
    calibrated = disk_registry.calibrated
    now = utcnow()
    prediction = await _store(Prediction(
        org_id=org_id, server_id=server.id, rack_id=server.rack_id, dc_id=server.dc_id, kind="disk_failure",
        type="Disk failure risk", category="storage", metric="disk", severity=top.level,
        risk_score=top.risk, probability=top.risk if calibrated else None, probability_calibrated=calibrated,
        horizon=f"{disk_registry.horizon_days}d", confidence=conf, confidence_reason=reason, factors=_factors(drive, top),
        details=[{"device": d.device, "model": d.model, "serial": d.serial, "riskScore": r.risk, "level": r.level} for d, r in zip(drives, results)],
        recommendation=RECOMMENDATION if top.level != "normal" else "No action needed. A low score does not rule out failure, so keep backups current.",
        model_version=disk_registry.version, experimental=True, bucket_start=ts, generated_at=now, expected_at=ts + timedelta(days=disk_registry.horizon_days), demo=server.demo,
    ))
    for d, r in zip(drives, results):
        key = f"disk:{server.id}:{d.serial}"
        if r.level == "critical":
            await alert_svc.raise_alert(
                org_id, key, f"Disk failure risk on {server.hostname}",
                f"Drive {d.device} ({d.model}, {d.serial}) reached the critical risk level for the next {disk_registry.horizon_days} days (score {r.risk:.3f}). {RECOMMENDATION}",
                "warning", server.id, None, [], demo=server.demo,
            )
        else:
            await alert_svc.clear_alert(org_id, key, "the drive's risk dropped below the critical level.")
    return prediction
