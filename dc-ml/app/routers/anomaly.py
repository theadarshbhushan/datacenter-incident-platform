from typing import Dict, Any, List, Optional
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.isolation_forest import IsolationForestDetector
from app.models.xgboost_classifier import XGBoostClassifier

router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])

if_detector = IsolationForestDetector()
xgb_classifier = XGBoostClassifier()


class MetricsPayload(BaseModel):
    cpu_pct: Optional[float] = 50.0
    ram_pct: Optional[float] = 50.0
    disk_io_mbps: Optional[float] = 20.0
    net_mbps: Optional[float] = 100.0
    temp_celsius: Optional[float] = 55.0
    disk_used_pct: Optional[float] = 50.0


class AnomalyDetectRequest(BaseModel):
    server_id: Optional[str] = "server-01"
    metrics: Optional[Dict[str, Any]] = None
    history: Optional[List[Dict[str, Any]]] = None

    # Fallback direct fields support
    cpu_pct: Optional[float] = None
    ram_pct: Optional[float] = None
    disk_io_mbps: Optional[float] = None
    net_mbps: Optional[float] = None
    temp_celsius: Optional[float] = None
    disk_used_pct: Optional[float] = None


@router.post("/detect")
async def detect_anomaly(payload: AnomalyDetectRequest):
    """
    Evaluates real-time server telemetry using combined Isolation Forest
    and XGBoost Classifier + TreeExplainer SHAP attribution.
    """
    server_id = payload.server_id or "server-01"

    # Extract metrics dict
    if payload.metrics and isinstance(payload.metrics, dict):
        metrics_dict = payload.metrics
    else:
        metrics_dict = {
            "cpu_pct": payload.cpu_pct if payload.cpu_pct is not None else 50.0,
            "ram_pct": payload.ram_pct if payload.ram_pct is not None else 50.0,
            "disk_io_mbps": payload.disk_io_mbps if payload.disk_io_mbps is not None else 20.0,
            "net_mbps": payload.net_mbps if payload.net_mbps is not None else 100.0,
            "temp_celsius": payload.temp_celsius if payload.temp_celsius is not None else 55.0,
            "disk_used_pct": payload.disk_used_pct if payload.disk_used_pct is not None else 50.0,
        }

    # 1. Isolation Forest prediction
    if_res = if_detector.predict(metrics_dict)
    if_score = float(if_res["anomaly_score"])
    if_is_anomaly = bool(if_res["is_anomaly"])

    # 2. XGBoost prediction & SHAP explanation
    xgb_res = xgb_classifier.predict(metrics_dict)
    shap_explanation = xgb_classifier.explain(metrics_dict)

    incident_type = xgb_res["incident_type"]
    confidence = float(xgb_res["confidence"])

    # Combined anomaly decision
    is_anomaly = bool(if_is_anomaly or (incident_type != "normal" and confidence > 0.60))

    # Calibrated combined anomaly score
    if is_anomaly:
        combined_score = round(max(if_score, confidence if incident_type != "normal" else 0.75), 4)
    else:
        combined_score = round(min(if_score, 0.35), 4)

    return {
        "server_id": server_id,
        "timestamp": datetime.utcnow().isoformat(),
        "anomaly_score": combined_score,
        "is_anomaly": is_anomaly,
        "incident_type": incident_type if is_anomaly else "nominal",
        "confidence": round(confidence, 4),
        "shap_explanation": shap_explanation,
    }
