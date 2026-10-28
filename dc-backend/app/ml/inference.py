"""
Model loading and scoring. The bundle is loaded once at API startup (see app.main lifespan) and kept
in memory; requests never train or reload it.

Terminology used throughout the API:
- anomaly score: percentile of the server's Isolation Forest score within the training distribution
  (0-1). It ranks how unusual the reading is. It is NOT a probability.
- risk score: output of the experimental early-warning classifier (0-1).
- probability: the risk score, but only when its calibration passed the held-out test during training.
  Otherwise it is null and the UI says the score is uncalibrated.
- severity: an operating decision from fixed thresholds (normal / warning / critical).
- confidence: how much data backs the assessment (24h baseline coverage, and whether the metric type
  was represented in the labeled training data). It is a label, not a number.
"""
from __future__ import annotations

import gzip
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from loguru import logger

from app.ml import features as F
from app.ml.trees import ClassifierScorer, IsolationForestScorer

DEFAULT_BUNDLE = Path(__file__).resolve().parent / "artifacts" / "model_bundle.json.gz"

METRIC_INFO: Dict[str, dict] = {
    "cpu": {"label": "CPU", "unit": "%", "type": "CPU anomaly", "category": "capacity", "validated": True},
    "memory": {"label": "Memory", "unit": "%", "type": "Memory anomaly", "category": "software", "validated": False},
    "storage": {"label": "Disk usage", "unit": "%", "type": "Disk usage anomaly", "category": "storage", "validated": False},
    "disk_io": {"label": "Disk I/O", "unit": " MB/s", "type": "Disk I/O anomaly", "category": "storage", "validated": True},
    "network": {"label": "Network throughput", "unit": " Mb/s", "type": "Network traffic anomaly", "category": "network", "validated": True},
    "temperature": {"label": "Temperature", "unit": "°C", "type": "Thermal anomaly", "category": "thermal", "validated": False},
    "power": {"label": "Power draw", "unit": " W", "type": "Power anomaly", "category": "power", "validated": False},
    "latency": {"label": "Network latency", "unit": " ms", "type": "Latency anomaly", "category": "network", "validated": False},
}

RECOMMENDATIONS = {
    "capacity": "Check which process or job drove CPU up, and move or throttle it if the server is saturated.",
    "software": "Look for a memory leak or a recent deploy; restart the service in a quiet window if memory keeps climbing.",
    "storage": "Check disk health (SMART) and which process is writing; free space or expand the volume before it fills.",
    "network": "Check the switch port, uplink errors and traffic sources for this server.",
    "thermal": "Check fans, airflow and inlet temperature for the rack; move heavy workloads if it keeps rising.",
    "power": "Check PSU status and power feeds for the server and rack.",
}


def fmt(metric: str, value: Optional[float]) -> str:
    if value is None:
        return "—"
    unit = METRIC_INFO[metric]["unit"]
    return f"{value:.1f}{unit}" if abs(value) < 1000 else f"{value:,.0f}{unit}"


@dataclass
class MetricResult:
    metric: str
    anomaly_score: float          # percentile 0-1
    raw_score: float
    level: str                    # normal / warning / critical (current bucket)
    sustained_critical: bool      # the alert rule: warning for 15 minutes, critical at least once
    risk_score: Optional[float]
    coverage: float
    current: Optional[float]
    median: Optional[float]


@dataclass
class ServerAssessment:
    metrics: List[MetricResult] = field(default_factory=list)
    skipped: List[str] = field(default_factory=list)   # metrics without enough history

    @property
    def scored(self) -> bool:
        return bool(self.metrics)


class ModelRegistry:
    def __init__(self) -> None:
        self.bundle: Optional[dict] = None
        self.error: Optional[str] = None
        self.path: Optional[Path] = None
        self.sha256 = ""
        self._if: Optional[IsolationForestScorer] = None
        self._ew: Optional[ClassifierScorer] = None

    # ---------- lifecycle ----------

    def load(self, path: Optional[str | Path] = None) -> bool:
        self.path = Path(path) if path else DEFAULT_BUNDLE
        try:
            raw = self.path.read_bytes()
            bundle = json.loads(gzip.decompress(raw).decode("utf-8"))
            if bundle.get("format") != "vaultwatch-model-bundle/1":
                raise ValueError(f"unsupported bundle format {bundle.get('format')!r}")
            if bundle["features"] != F.FEATURE_NAMES or bundle["bucket_seconds"] != F.BUCKET_SECONDS:
                raise ValueError("bundle was trained with different feature definitions; retrain it")
            self._if = IsolationForestScorer(bundle["anomaly"]["model"])
            ew = bundle.get("early_warning")
            self._ew = ClassifierScorer(ew["model"], ew["calibration"]) if ew else None
            self.bundle, self.sha256, self.error = bundle, hashlib.sha256(raw).hexdigest(), None
            logger.info(f"Loaded model {bundle['model_version']} from {self.path}")
            return True
        except FileNotFoundError:
            self.error = f"Model artifact not found at {self.path}. Run: python -m app.ml.training.train"
        except Exception as e:  # keep the API up; readiness reports the problem
            self.error = f"Model artifact could not be loaded: {e}"
        self.bundle, self._if, self._ew = None, None, None
        logger.error(self.error)
        return False

    @property
    def ready(self) -> bool:
        return self._if is not None

    @property
    def version(self) -> Optional[str]:
        return self.bundle["model_version"] if self.bundle else None

    @property
    def early_warning(self) -> Optional[dict]:
        return self.bundle.get("early_warning") if self.bundle else None

    def status(self) -> dict:
        if not self.bundle:
            return {"ready": False, "error": self.error}
        ew = self.early_warning
        return {
            "ready": True, "version": self.version, "trainedAt": self.bundle["trained_at"], "artifactSha256": self.sha256,
            "anomalyThresholds": self.bundle["anomaly"]["thresholds"],
            "earlyWarning": {"available": ew is not None, "experimental": True,
                             "probabilityCalibrated": bool(ew and ew["probability_is_calibrated"]), "horizonMinutes": 60},
            "evaluation": self.bundle.get("summary", {}),
        }

    # ---------- scoring ----------

    def _percentile(self, raw: np.ndarray) -> np.ndarray:
        q = self.bundle["anomaly"]["score_quantiles"]
        return np.interp(raw, q, np.linspace(0, 1, len(q)))

    def assess(self, series: Dict[str, np.ndarray]) -> ServerAssessment:
        """Score each metric's latest complete bucket. `series` maps metric -> bucket means, oldest first."""
        if not self.ready:
            raise RuntimeError(self.error or "model not loaded")
        th = self.bundle["anomaly"]["thresholds"]
        sustain = int(self.bundle["anomaly"].get("sustain_buckets", 3))
        out = ServerAssessment()
        for metric, values in series.items():
            v = np.asarray(values, dtype=float)[-(F.BASELINE + sustain + 1):]
            rows = F.series_features(v)[-sustain:]
            if len(rows) < 1 or np.isnan(rows[-1]).any():
                out.skipped.append(metric)
                continue
            ok = ~np.isnan(rows).any(axis=1)
            raw = np.full(len(rows), -np.inf)
            raw[ok] = -self._if.score_samples(rows[ok])
            current = raw[-1]
            level = "critical" if current >= th["critical"] else "warning" if current >= th["warning"] else "normal"
            sustained = bool(len(raw) >= sustain and np.all(raw[-sustain:] >= th["warning"]) and np.any(raw[-sustain:] >= th["critical"]))
            risk = None
            if self._ew is not None:
                risk = float(self._ew.predict_proba(rows[-1:])[0])
            base = F.baseline_summary(v)
            hist = v[:-1][-F.BASELINE:]
            out.metrics.append(MetricResult(
                metric=metric, anomaly_score=round(float(self._percentile(np.array([current]))[0]), 4), raw_score=float(current),
                level=level, sustained_critical=sustained, risk_score=None if risk is None else round(risk, 4),
                coverage=round(float(np.sum(~np.isnan(hist)) / F.BASELINE), 3), current=base["current"], median=base["median"],
            ))
        return out


def confidence_for(m: MetricResult) -> tuple[str, str]:
    validated = METRIC_INFO[m.metric]["validated"]
    hours = round(m.coverage * 24, 1)
    if m.coverage >= 0.95 and validated:
        return "high", f"Full 24-hour baseline, and {METRIC_INFO[m.metric]['label']} was in the labeled evaluation data."
    if m.coverage >= 0.5:
        reason = f"{hours} of 24 baseline hours available." if m.coverage < 0.95 else "Full 24-hour baseline."
        if not validated:
            reason += f" {METRIC_INFO[m.metric]['label']} was not in the labeled evaluation data."
        return "medium", reason
    return "low", f"Only {hours} hours of baseline data; scores stabilize after 24 hours."


registry = ModelRegistry()
