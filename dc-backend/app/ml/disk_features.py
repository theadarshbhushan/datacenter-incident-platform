"""
SMART feature engineering shared by disk-failure training (app.ml.training.train_disk) and serving.

A row describes one drive from two readings about a week apart. Raw SMART values are vendor
specific, so only the counters whose meaning is shared across vendors are used, and on a log scale.
A counter the drive does not report becomes -1, and a change with no earlier reading becomes 0.

Keep this module free of pandas/scikit-learn so the API image only needs numpy.
"""
from __future__ import annotations

from typing import Dict

import numpy as np

SMART_ATTRS = (5, 9, 187, 188, 194, 197, 198)
ERROR_ATTRS = (5, 187, 197, 198)           # reallocated, reported uncorrectable, pending, offline uncorrectable
DELTA_ATTRS = (5, 197, 198)
HOURS_PER_YEAR = 8766.0

ATTR_LABELS = {
    5: "Reallocated sectors", 187: "Reported uncorrectable errors", 188: "Command timeouts",
    197: "Pending sectors", 198: "Offline uncorrectable sectors",
}

FEATURE_NAMES = (
    "log_smart_5", "log_smart_187", "log_smart_188", "log_smart_197", "log_smart_198",
    "age_years", "temperature_c", "error_attrs_nonzero",
    "log_delta_5", "log_delta_197", "log_delta_198",
)


def _log_or_missing(v: np.ndarray) -> np.ndarray:
    return np.where(np.isnan(v), -1.0, np.log1p(np.maximum(np.nan_to_num(v), 0.0)))


def temperature(raw: np.ndarray) -> np.ndarray:
    """Many drives pack minimum and maximum temperature above the low byte of attribute 194."""
    v = np.asarray(raw, dtype=float)
    out = np.where(np.isnan(v), -1.0, np.nan_to_num(v))
    return np.where(out > 255, np.mod(out, 256), out)


def feature_matrix(now: Dict[int, np.ndarray], before: Dict[int, np.ndarray]) -> np.ndarray:
    """`now` and `before` map a SMART attribute id to raw values, one per drive. NaN means not reported."""
    age = now[9] / HOURS_PER_YEAR
    columns = [_log_or_missing(now[a]) for a in (5, 187, 188, 197, 198)]
    columns += [np.where(np.isnan(age), -1.0, age), temperature(now[194])]
    columns.append(np.sum([np.nan_to_num(now[a]) > 0 for a in ERROR_ATTRS], axis=0).astype(float))
    for a in DELTA_ATTRS:
        change = np.nan_to_num(now[a] - before[a], nan=0.0)
        columns.append(np.log1p(np.maximum(change, 0.0)))
    return np.column_stack(columns)
