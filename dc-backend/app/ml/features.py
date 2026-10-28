"""
Feature engineering shared by training (app.ml.training) and inference (app.ml.inference).

Every metric is handled as its own univariate series of 5-minute buckets. Features at bucket t use
only buckets before and at t (causal), and are scale-free: each value is expressed relative to a
robust 24-hour baseline of the same series. That lets one model, trained on the real NAB CloudWatch
series (CPU, disk writes, network in), score any metric without knowing its unit.

Keep this module free of pandas/scikit-learn so the API image only needs numpy.
"""
from __future__ import annotations

import warnings

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

BUCKET_SECONDS = 300            # telemetry is averaged into 5-minute buckets before scoring
BASELINE = 288                  # 24 hours of buckets
MIN_HISTORY = 48                # 4 hours: fewer buckets and the series is not scored
SHORT = 3                       # 15 minutes
HOUR = 12                       # 1 hour
Z_CLIP = 20.0

FEATURE_NAMES = [
    "z_level",        # current bucket vs 24h median, in robust standard deviations
    "z_short",        # 15-minute mean vs 24h median
    "z_hour",         # 1-hour mean vs 24h median
    "z_step",         # change since the previous bucket vs typical bucket-to-bucket change
    "log_volatility",  # 1-hour standard deviation vs 24h robust spread (log ratio)
]

_MAD_TO_STD = 1.4826


def _robust_scale(window: np.ndarray, axis: int = -1) -> tuple[np.ndarray, np.ndarray]:
    """Median and a strictly positive robust spread for each window (NaNs ignored)."""
    med = np.nanmedian(window, axis=axis)
    mad = np.nanmedian(np.abs(window - np.expand_dims(med, axis)), axis=axis) * _MAD_TO_STD
    std = np.nanstd(window, axis=axis)
    # Flat baselines (MAD 0) fall back to the standard deviation, then to a small fraction of the level,
    # so a flatline that suddenly moves still produces a large but finite z-score.
    # The spread never drops below a quarter of the window's standard deviation or 2% of its level, so
    # near-flat series with rare spikes do not turn every small wiggle into an extreme z-score.
    floor = np.maximum.reduce([np.abs(med) * 0.02, std * 0.25, np.full_like(med, 1e-3)])
    return med, np.maximum(mad, floor)


def fill_gaps(values: np.ndarray) -> np.ndarray:
    """Forward-fill missing buckets (never backward: that would leak the future). Leading NaNs stay NaN."""
    v = np.asarray(values, dtype=float).copy()
    mask = np.isnan(v)
    if not mask.any():
        return v
    idx = np.where(~mask, np.arange(len(v)), 0)
    np.maximum.accumulate(idx, out=idx)
    out = v[idx]
    out[: np.argmax(~mask) if (~mask).any() else len(v)] = np.nan
    return out


def series_features(values: np.ndarray) -> np.ndarray:
    """
    Feature matrix (n x len(FEATURE_NAMES)) for a bucketed series. Rows with fewer than MIN_HISTORY
    earlier buckets are NaN. The baseline for row t is buckets [t-BASELINE, t), never t itself.
    """
    x = fill_gaps(values)
    n = len(x)
    out = np.full((n, len(FEATURE_NAMES)), np.nan)
    if n <= MIN_HISTORY:
        return out
    # Left-pad with NaN so every row has a full-size (partly empty) baseline window.
    padded = np.concatenate([np.full(BASELINE, np.nan), x])
    base = sliding_window_view(padded[:-1], BASELINE)[: n]          # row t -> x[t-BASELINE : t]
    counts = np.sum(~np.isnan(base), axis=1)
    ok = counts >= MIN_HISTORY
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN windows (gaps) are expected and yield NaN
        med, spread = _robust_scale(base[ok], axis=1)
        diffs = np.diff(base[ok], axis=1)
        _, step_spread = _robust_scale(diffs, axis=1)

        def rolling_mean(k: int) -> np.ndarray:
            pad = np.concatenate([np.full(k - 1, np.nan), x])
            return np.nanmean(sliding_window_view(pad, k), axis=1)

        short = rolling_mean(SHORT)[ok]
        hour = rolling_mean(HOUR)[ok]
        hour_std = np.nanstd(sliding_window_view(np.concatenate([np.full(HOUR - 1, np.nan), x]), HOUR), axis=1)[ok]
        prev = np.concatenate([[np.nan], x[:-1]])[ok]
        cur = x[ok]

        feats = np.column_stack([
            (cur - med) / spread,
            (short - med) / spread,
            (hour - med) / spread,
            (cur - prev) / step_spread,
            np.log((hour_std + 1e-9) / spread + 1e-6),
        ])
    feats = np.clip(feats, -Z_CLIP, Z_CLIP)
    feats[np.isnan(cur)] = np.nan
    out[ok] = feats
    return out


def latest_features(values: np.ndarray) -> np.ndarray | None:
    """Features of the last bucket only, or None if the series is too short or the last bucket is missing."""
    v = np.asarray(values, dtype=float)[-(BASELINE + 1):]
    if np.sum(~np.isnan(v[:-1])) < MIN_HISTORY or np.isnan(v[-1]):
        return None
    row = series_features(v)[-1]
    return None if np.isnan(row).any() else row


def baseline_summary(values: np.ndarray) -> dict:
    """Human-readable baseline numbers for contributing-factor explanations."""
    v = fill_gaps(np.asarray(values, dtype=float))[-(BASELINE + 1):]
    hist = v[:-1][~np.isnan(v[:-1])]
    if len(hist) == 0:
        return {"current": None, "median": None, "spread": None}
    med, spread = _robust_scale(hist)
    return {"current": float(v[-1]), "median": float(med), "spread": float(spread)}
