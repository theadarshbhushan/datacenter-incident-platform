"""
POST /anomaly/detect

Receives metric time-series for a server and returns an anomaly score
and boolean flag via the Isolation Forest model.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from app.utils.preprocessor import prepare_anomaly_features

router = APIRouter(tags=["Anomaly Detection"])


class AnomalyRequest(BaseModel):
    server_id: str
    metrics: list[dict]


class AnomalyData(BaseModel):
    anomaly_score: float
    is_anomaly: bool


class AnomalyResponse(BaseModel):
    status: str = "ok"
    server_id: str
    data: AnomalyData


@router.post("/anomaly/detect", response_model=AnomalyResponse)
async def detect_anomaly(payload: AnomalyRequest):
    from app.main import anomaly_detector  # deferred to avoid circular import

    if not payload.metrics:
        raise HTTPException(status_code=400, detail="Metrics list is empty")

    if not anomaly_detector.is_trained:
        raise HTTPException(
            status_code=503,
            detail="Anomaly detection model is not trained yet. Call POST /train first.",
        )

    try:
        features = prepare_anomaly_features(payload.metrics)
        result = anomaly_detector.predict(features)

        logger.info(
            f"Anomaly detection for {payload.server_id}: "
            f"score={result['anomaly_score']}, anomaly={result['is_anomaly']}"
        )

        return AnomalyResponse(
            server_id=payload.server_id,
            data=AnomalyData(**result),
        )
    except Exception as e:
        logger.error(f"Anomaly detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
