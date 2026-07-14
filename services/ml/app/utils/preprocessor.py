"""
Feature engineering utilities for the ML service.

Transforms raw metric dictionaries into the numeric formats
required by Isolation Forest, XGBoost, and the LSTM forecaster.
"""

import numpy as np
import pandas as pd
import torch
from loguru import logger

# ── Column ordering used everywhere ──────────────────────────────────────────
METRIC_COLUMNS = [
    "cpu_pct",
    "ram_pct",
    "disk_io_mbps",
    "net_mbps",
    "temp_celsius",
    "disk_used_pct",
]

INCIDENT_TYPES = [
    "cpu_spike",
    "memory_leak",
    "disk_failure",
    "network_anomaly",
    "thermal_event",
    "predicted_outage",
]

INCIDENT_TYPE_TO_IDX = {t: i for i, t in enumerate(INCIDENT_TYPES)}
IDX_TO_INCIDENT_TYPE = {i: t for i, t in enumerate(INCIDENT_TYPES)}


def _metrics_to_dataframe(metrics: list[dict]) -> pd.DataFrame:
    """Convert a list of metric dicts into a sorted DataFrame."""
    df = pd.DataFrame(metrics)
    for col in METRIC_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.sort_values("timestamp").reset_index(drop=True)
    return df


# ── Anomaly Detection (Isolation Forest) ─────────────────────────────────────

def prepare_anomaly_features(metrics: list[dict]) -> np.ndarray:
    """
    Return an (N, 6) float array of the core metric columns, suitable
    for scikit-learn's IsolationForest.
    """
    df = _metrics_to_dataframe(metrics)
    features = df[METRIC_COLUMNS].values.astype(np.float32)
    logger.debug(f"Prepared anomaly features with shape {features.shape}")
    return features


# ── Classification (XGBoost) ─────────────────────────────────────────────────

def prepare_classification_features(features: list[float]) -> np.ndarray:
    """
    Accept the 7-element feature vector built by the backend
    [cpu_pct, ram_pct, disk_io_mbps, net_mbps, temp_celsius, cpu_trend, ram_trend]
    and return an (1, 7) ndarray ready for XGBClassifier.predict.
    """
    arr = np.asarray(features, dtype=np.float32).reshape(1, -1)
    logger.debug(f"Prepared classification features with shape {arr.shape}")
    return arr


def prepare_classification_training_data(
    metrics: list[dict],
    labels: list[str] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build (X, y) arrays suitable for training the XGBoost classifier.

    If *labels* is None, we synthesize labels heuristically from the
    metric values so the model can be bootstrapped before real incident
    data is available.
    """
    df = _metrics_to_dataframe(metrics)
    if len(df) < 2:
        raise ValueError("Need at least 2 data points for training")

    # Build feature matrix — same 7 features the backend sends
    cpu = df["cpu_pct"].values
    ram = df["ram_pct"].values
    disk = df["disk_io_mbps"].values
    net = df["net_mbps"].values
    temp = df["temp_celsius"].values

    # Trends: difference vs 12 steps (~1 hour) ago
    shift = min(12, len(df) - 1)
    cpu_trend = cpu - np.roll(cpu, shift)
    ram_trend = ram - np.roll(ram, shift)
    # Zero out the rolled-over first few entries
    cpu_trend[:shift] = 0.0
    ram_trend[:shift] = 0.0

    X = np.column_stack([cpu, ram, disk, net, temp, cpu_trend, ram_trend]).astype(np.float32)

    if labels is not None:
        y = np.array([INCIDENT_TYPE_TO_IDX.get(l, 5) for l in labels], dtype=np.int64)
    else:
        # Heuristic labelling from metric values
        y = _heuristic_labels(df)

    logger.debug(f"Prepared classification training data: X={X.shape}, y={y.shape}")
    return X, y


def _heuristic_labels(df: pd.DataFrame) -> np.ndarray:
    """Assign synthetic incident-type labels based on metric thresholds."""
    labels = np.full(len(df), 5, dtype=np.int64)  # default: predicted_outage
    labels[df["cpu_pct"].values > 85] = 0           # cpu_spike
    labels[df["ram_pct"].values > 85] = 1           # memory_leak
    labels[df["disk_io_mbps"].values > 450] = 2     # disk_failure
    labels[df["net_mbps"].values > 900] = 3         # network_anomaly
    labels[df["temp_celsius"].values > 82] = 4      # thermal_event
    return labels


# ── Forecasting (LSTM) ───────────────────────────────────────────────────────

FORECAST_INPUT_LEN = 60   # points
FORECAST_OUTPUT_LEN = 30  # points
FORECAST_FEATURES = ["cpu_pct", "ram_pct"]  # what we predict


def prepare_forecast_sequences(
    metrics: list[dict],
    input_len: int = FORECAST_INPUT_LEN,
    output_len: int = FORECAST_OUTPUT_LEN,
) -> tuple[torch.Tensor, torch.Tensor | None]:
    """
    Build sliding-window tensors for LSTM training / inference.

    Returns
    -------
    X : Tensor of shape (N, input_len, 2)
    y : Tensor of shape (N, output_len, 2) — or None when there are
        not enough trailing points for a target window.
    """
    df = _metrics_to_dataframe(metrics)
    series = df[FORECAST_FEATURES].values.astype(np.float32)

    if len(series) < input_len:
        # Pad with the mean so we can still run inference
        pad_len = input_len - len(series)
        pad = np.tile(series.mean(axis=0), (pad_len, 1))
        series = np.concatenate([pad, series], axis=0)

    total = input_len + output_len
    if len(series) < total:
        # Inference-only: return the last input_len window, no targets
        X = torch.tensor(series[-input_len:], dtype=torch.float32).unsqueeze(0)
        logger.debug(f"Prepared forecast inference tensor: X={X.shape}")
        return X, None

    # Sliding windows for training
    xs, ys = [], []
    for start in range(len(series) - total + 1):
        xs.append(series[start : start + input_len])
        ys.append(series[start + input_len : start + total])

    X = torch.tensor(np.array(xs), dtype=torch.float32)
    y = torch.tensor(np.array(ys), dtype=torch.float32)
    logger.debug(f"Prepared forecast training tensors: X={X.shape}, y={y.shape}")
    return X, y


# ── Synthetic Data Generation ─────────────────────────────────────────────────

def generate_synthetic_metrics(n_samples: int = 2000, seed: int = 42) -> list[dict]:
    """
    Produce realistic-looking metric data points for bootstrapping
    model training when no historical data is available.
    """
    rng = np.random.RandomState(seed)
    timestamps = pd.date_range(
        end=pd.Timestamp.utcnow(),
        periods=n_samples,
        freq="30s",
    )

    # Base signals with sinusoidal daily patterns and random noise
    t = np.linspace(0, 4 * np.pi, n_samples)
    cpu = 40 + 20 * np.sin(t) + rng.normal(0, 5, n_samples)
    ram = 50 + 15 * np.sin(t + 1) + rng.normal(0, 4, n_samples)
    disk_io = 100 + 50 * np.abs(np.sin(t / 2)) + rng.normal(0, 15, n_samples)
    net = 200 + 100 * np.abs(np.sin(t / 3)) + rng.normal(0, 20, n_samples)
    temp = 55 + 10 * np.sin(t + 2) + rng.normal(0, 3, n_samples)
    disk_used = 45 + 10 * np.sin(t / 4) + rng.normal(0, 2, n_samples)

    # Inject anomaly spikes in ~5 % of data
    spike_mask = rng.random(n_samples) > 0.95
    cpu[spike_mask] = rng.uniform(88, 100, spike_mask.sum())
    ram[spike_mask] = rng.uniform(88, 100, spike_mask.sum())
    temp[spike_mask] = rng.uniform(83, 95, spike_mask.sum())

    # Clip to valid ranges
    cpu = np.clip(cpu, 0, 100)
    ram = np.clip(ram, 0, 100)
    disk_io = np.clip(disk_io, 0, 1000)
    net = np.clip(net, 0, 2000)
    temp = np.clip(temp, 15, 100)
    disk_used = np.clip(disk_used, 0, 100)

    metrics = []
    for i in range(n_samples):
        metrics.append({
            "timestamp": timestamps[i].isoformat(),
            "cpu_pct": round(float(cpu[i]), 2),
            "ram_pct": round(float(ram[i]), 2),
            "disk_io_mbps": round(float(disk_io[i]), 2),
            "net_mbps": round(float(net[i]), 2),
            "temp_celsius": round(float(temp[i]), 2),
            "disk_used_pct": round(float(disk_used[i]), 2),
        })
    logger.info(f"Generated {n_samples} synthetic metric samples")
    return metrics
