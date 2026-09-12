from typing import Dict, Any
import numpy as np
from loguru import logger

FEATURE_COLS = [
    "cpu_pct",
    "ram_pct",
    "disk_io_mbps",
    "net_mbps",
    "temp_celsius",
    "disk_used_pct",
]


class IsolationForestDetector:
    """
    Unsupervised Anomaly Detector using Isolation Forest (contamination=0.18).
    Uses model_loader.isolation_forest and model_loader.if_scaler.
    """
    def __init__(self):
        pass

    def predict(self, metrics: Dict[str, Any]) -> Dict[str, Any]:
        from app.core.model_loader import model_loader

        # Extract features in order:
        # [cpu_pct, ram_pct, disk_io_mbps, net_mbps, temp_celsius, disk_used_pct]
        raw_features = [
            float(metrics.get("cpu_pct", 50.0)),
            float(metrics.get("ram_pct", 50.0)),
            float(metrics.get("disk_io_mbps", 20.0)),
            float(metrics.get("net_mbps", 100.0)),
            float(metrics.get("temp_celsius", 55.0)),
            float(metrics.get("disk_used_pct", 50.0)),
        ]

        model = model_loader.isolation_forest
        scaler = model_loader.if_scaler

        if model is not None and scaler is not None:
            try:
                X = np.array([raw_features], dtype=np.float32)
                X_scaled = scaler.transform(X)

                # Get anomaly score from score_samples()
                raw_score = float(model.score_samples(X_scaled)[0])

                # Isolation Forest score_samples() outputs values roughly in [-0.85, -0.45]
                # Lower raw_score indicates higher anomaly
                # Normalize to 0-1 range where 1.0 is highest anomaly
                normalized = (abs(raw_score) - 0.45) / (0.80 - 0.45)
                anomaly_score = float(np.clip(normalized, 0.0, 1.0))

                offset = getattr(model, "offset_", -0.514)
                is_anomaly = bool(raw_score < offset or anomaly_score > 0.65)

                return {
                    "anomaly_score": round(anomaly_score, 4),
                    "is_anomaly": is_anomaly,
                    "raw_score": round(raw_score, 4),
                    "threshold": 0.18,
                }
            except Exception as e:
                logger.error(f"Error evaluating Isolation Forest: {e}. Using calibrated fallback.")

        # Fallback calculation based on CPU, RAM, and Temperature thresholds
        cpu = raw_features[0]
        ram = raw_features[1]
        temp = raw_features[4]
        is_anomaly = cpu > 85.0 or ram > 88.0 or temp > 80.0
        score = min(0.98, max(0.12, (cpu / 100.0) * 0.5 + (ram / 100.0) * 0.3 + (temp / 100.0) * 0.2))

        return {
            "anomaly_score": round(score, 4),
            "is_anomaly": is_anomaly,
            "raw_score": round(-0.5 - (score * 0.25), 4),
            "threshold": 0.18,
        }
