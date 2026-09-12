from typing import Dict, Any, List, Optional
from fastapi import APIRouter
from pydantic import BaseModel

from app.models.ensemble import EnsemblePredictor

router = APIRouter(prefix="/ensemble", tags=["Ensemble Prediction"])

ensemble_predictor = EnsemblePredictor()


class EnsembleRequest(BaseModel):
    server_id: Optional[str] = "server-01"
    metrics: Optional[Dict[str, Any]] = None
    history: Optional[List[Dict[str, Any]]] = None

    # Direct feature fallback
    cpu_pct: Optional[float] = None
    ram_pct: Optional[float] = None
    disk_io_mbps: Optional[float] = None
    net_mbps: Optional[float] = None
    temp_celsius: Optional[float] = None
    disk_used_pct: Optional[float] = None


@router.post("/predict")
async def predict_ensemble(payload: EnsembleRequest):
    """
    Executes full multi-model weighted ensemble (IF 0.35, XGB 0.40, LSTM 0.25)
    returning consensus anomaly decision, SHAP explanation, forecast, and recommendations.
    """
    server_id = payload.server_id or "server-01"

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

    result = ensemble_predictor.predict(
        server_id=server_id,
        metrics=metrics_dict,
        history=payload.history,
    )
    return result
