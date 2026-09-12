"""
POST /classify

Receives a 7-element feature vector from the backend and returns an
incident-type classification with confidence score via the XGBoost model.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from app.utils.preprocessor import prepare_classification_features

router = APIRouter(tags=["Classification"])


class ClassifyRequest(BaseModel):
    server_id: str
    features: list[float]


class ClassifyData(BaseModel):
    incident_type: str
    confidence: float


class ClassifyResponse(BaseModel):
    status: str = "ok"
    server_id: str
    data: ClassifyData


@router.post("/classify", response_model=ClassifyResponse)
async def classify_incident(payload: ClassifyRequest):
    from app.main import incident_classifier  # deferred import

    if not payload.features or len(payload.features) != 7:
        raise HTTPException(
            status_code=400,
            detail=f"Expected exactly 7 features, got {len(payload.features) if payload.features else 0}",
        )

    if not incident_classifier.is_trained:
        raise HTTPException(
            status_code=503,
            detail="Classification model is not trained yet. Call POST /train first.",
        )

    try:
        X = prepare_classification_features(payload.features)
        result = incident_classifier.predict(X)

        logger.info(
            f"Classification for {payload.server_id}: "
            f"type={result['incident_type']}, confidence={result['confidence']}"
        )

        return ClassifyResponse(
            server_id=payload.server_id,
            data=ClassifyData(**result),
        )
    except Exception as e:
        logger.error(f"Classification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
