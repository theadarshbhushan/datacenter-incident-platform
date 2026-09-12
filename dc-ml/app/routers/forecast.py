from typing import Dict, Any, List, Optional
from fastapi import APIRouter
from pydantic import BaseModel

from app.models.lstm_forecaster import LSTMForecasterService

router = APIRouter(prefix="/forecast", tags=["Forecasting"])

forecaster = LSTMForecasterService()


class ForecastRequest(BaseModel):
    server_id: Optional[str] = "server-01"
    metrics_history: Optional[List[Dict[str, Any]]] = None
    metrics: Optional[List[Dict[str, Any]]] = None
    hours: Optional[int] = 1


@router.post("/predict")
async def predict_forecast(payload: ForecastRequest):
    """
    Computes 10-step ahead lead CPU & RAM forecast with confidence intervals
    using trained Bi-LSTM with Temporal Attention.
    """
    server_id = payload.server_id or "server-01"
    history = payload.metrics_history or payload.metrics or []

    result = forecaster.predict(history)
    result["server_id"] = server_id
    result["model"] = "Bi-LSTM with Temporal Attention"

    return result
