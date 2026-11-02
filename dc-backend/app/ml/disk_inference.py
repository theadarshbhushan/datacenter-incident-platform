"""
Disk-failure model loading and scoring. Loaded once at API startup, like the anomaly model. The API
runs without this bundle: disk readings are stored and simply not scored.

The score is the chance a SATA hard drive fails within the bundle's horizon (30 days). It is shown as
a probability only when calibration passed the held-out test during training.
"""
from __future__ import annotations

import gzip
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from loguru import logger

from app.ml import disk_features as D
from app.ml.trees import ClassifierScorer

DEFAULT_BUNDLE = Path(__file__).resolve().parent / "artifacts" / "disk_model.json.gz"


@dataclass
class DiskResult:
    risk: float
    level: str                    # normal / warning / critical
    has_week_old_reading: bool


def _column(rows: List[Optional[Dict[int, float]]], attr: int) -> np.ndarray:
    return np.array([np.nan if not r or attr not in r else float(r[attr]) for r in rows], dtype=float)


class DiskRegistry:
    def __init__(self) -> None:
        self.bundle: Optional[dict] = None
        self.error: Optional[str] = None
        self.sha256 = ""
        self._scorer: Optional[ClassifierScorer] = None

    def load(self, path: Optional[str | Path] = None) -> bool:
        target = Path(path) if path else DEFAULT_BUNDLE
        try:
            raw = target.read_bytes()
            bundle = json.loads(gzip.decompress(raw).decode("utf-8"))
            if bundle.get("format") != "vaultwatch-disk-model/1":
                raise ValueError(f"unsupported bundle format {bundle.get('format')!r}")
            if bundle["features"] != list(D.FEATURE_NAMES):
                raise ValueError("bundle was trained with different feature definitions; retrain it")
            self._scorer = ClassifierScorer(bundle["model"], bundle["calibration"])
            self.bundle, self.sha256, self.error = bundle, hashlib.sha256(raw).hexdigest(), None
            logger.info(f"Loaded disk model {bundle['model_version']} from {target}")
            return True
        except FileNotFoundError:
            self.error = f"Disk model not found at {target}. Run: python -m app.ml.training.train_disk"
        except Exception as e:  # keep the API up; status reports the problem
            self.error = f"Disk model could not be loaded: {e}"
        self.bundle, self._scorer = None, None
        logger.warning(self.error)
        return False

    @property
    def ready(self) -> bool:
        return self._scorer is not None

    @property
    def version(self) -> Optional[str]:
        return self.bundle["model_version"] if self.bundle else None

    @property
    def calibrated(self) -> bool:
        return bool(self.bundle and self.bundle["probability_is_calibrated"])

    @property
    def horizon_days(self) -> int:
        return int(self.bundle["horizon_days"]) if self.bundle else 0

    def status(self) -> dict:
        if not self.bundle:
            return {"ready": False, "error": self.error}
        return {
            "ready": True, "version": self.version, "trainedAt": self.bundle["trained_at"], "artifactSha256": self.sha256,
            "horizonDays": self.horizon_days, "probabilityCalibrated": self.calibrated, "thresholds": self.bundle["thresholds"],
            "evaluation": self.bundle.get("summary", {}),
        }

    def assess(self, now: List[Dict[int, float]], before: List[Optional[Dict[int, float]]]) -> List[DiskResult]:
        """One result per drive. `before` holds each drive's reading from about a week ago, if there is one."""
        if not self.ready:
            raise RuntimeError(self.error or "disk model not loaded")
        attrs = D.SMART_ATTRS
        X = D.feature_matrix({a: _column(now, a) for a in attrs}, {a: _column(before, a) for a in attrs})
        risks = self._scorer.predict_proba(X)
        th = self.bundle["thresholds"]
        return [DiskResult(risk=round(float(r), 5), level="critical" if r >= th["critical"] else "warning" if r >= th["warning"] else "normal",
                           has_week_old_reading=b is not None) for r, b in zip(risks, before)]


disk_registry = DiskRegistry()
