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
    metrics: list[dict] | dict


class ExplanationFeature(BaseModel):
    feature: str
    value: float
    shap_value: float
    explanation: str


class ExplanationData(BaseModel):
    incident_type: str
    confidence: float
    top_features: list[ExplanationFeature]
    summary: str


class AnomalyData(BaseModel):
    anomaly_score: float
    is_anomaly: bool
    explanation: ExplanationData | None = None
    incident_type: str | None = None
    confidence: float | None = None
    top_features: list[ExplanationFeature] | None = None
    summary: str | None = None


class AnomalyResponse(BaseModel):
    status: str = "ok"
    server_id: str
    data: AnomalyData


@router.post("/anomaly/detect", response_model=AnomalyResponse)
async def detect_anomaly(payload: AnomalyRequest):
    from app.main import anomaly_detector, incident_classifier  # deferred to avoid circular import

    if not payload.metrics:
        raise HTTPException(status_code=400, detail="Metrics list is empty")

    if not anomaly_detector.is_trained:
        raise HTTPException(
            status_code=503,
            detail="Anomaly detection model is not trained yet. Call POST /train first.",
        )

    try:
        metrics_list = payload.metrics if isinstance(payload.metrics, list) else [payload.metrics]
        features = prepare_anomaly_features(metrics_list)
        result = anomaly_detector.predict(features)

        # Compute SHAP explanation from the latest metrics point
        explanation = None
        latest_metric = metrics_list[-1] if metrics_list else {}
        if incident_classifier.is_trained:
            try:
                explanation = incident_classifier.explain(latest_metric)
            except Exception as e:
                logger.warning(f"Could not compute SHAP explanation: {e}")

        logger.info(
            f"Anomaly detection for {payload.server_id}: "
            f"score={result['anomaly_score']}, anomaly={result['is_anomaly']}"
        )

        return AnomalyResponse(
            server_id=payload.server_id,
            data=AnomalyData(
                anomaly_score=result["anomaly_score"],
                is_anomaly=result["is_anomaly"],
                explanation=explanation,
                incident_type=explanation["incident_type"] if explanation else None,
                confidence=explanation["confidence"] if explanation else None,
                top_features=explanation["top_features"] if explanation else None,
                summary=explanation["summary"] if explanation else None,
            ),
        )
    except Exception as e:
        logger.error(f"Anomaly detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
