"""
Data Center Incident Prediction Platform — ML Service

Standalone FastAPI application that serves anomaly detection,
incident classification, and resource forecasting endpoints.

On startup, the service attempts to load previously trained models
from disk.  If none are found, it automatically trains all three
models on synthetic data so the endpoints are immediately usable.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.models.isolation_forest import AnomalyDetector
from app.models.xgboost_classifier import IncidentClassifier
from app.models.lstm_forecaster import LSTMForecaster
from app.utils.preprocessor import (
    generate_synthetic_metrics,
    prepare_anomaly_features,
    prepare_classification_training_data,
    prepare_forecast_sequences,
)

# ── Global model singletons ──────────────────────────────────────────────────
anomaly_detector = AnomalyDetector()
incident_classifier = IncidentClassifier()
lstm_forecaster = LSTMForecaster()


def _bootstrap_models():
    """Train all models on synthetic data when no saved weights exist."""
    logger.info("Bootstrapping models with synthetic data...")
    metrics = generate_synthetic_metrics(n_samples=2000)

    # Isolation Forest
    X_anomaly = prepare_anomaly_features(metrics)
    anomaly_detector.train(X_anomaly)

    # XGBoost
    X_cls, y_cls = prepare_classification_training_data(metrics)
    incident_classifier.train(X_cls, y_cls)

    # LSTM
    X_lstm, y_lstm = prepare_forecast_sequences(metrics)
    if y_lstm is not None:
        lstm_forecaster.train(X_lstm, y_lstm, epochs=30)
    else:
        logger.warning("Not enough synthetic data for LSTM training windows")

    logger.info("Bootstrap training complete — all models ready")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    logger.info("Starting ML Service...")

    # Configure MLflow (best-effort)
    try:
        import mlflow
        mlflow.set_tracking_uri(
            os.getenv("MLFLOW_TRACKING_URI", "file:/app/mlruns")
        )
    except Exception as e:
        logger.warning(f"MLflow setup skipped: {e}")

    # Try to load persisted models
    loaded_all = True
    if not anomaly_detector.load():
        loaded_all = False
    if not incident_classifier.load():
        loaded_all = False
    if not lstm_forecaster.load():
        loaded_all = False

    if not loaded_all:
        _bootstrap_models()

    logger.info("ML Service is ready to accept requests")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────
    logger.info("Shutting down ML Service...")


# ── FastAPI application ──────────────────────────────────────────────────────

app = FastAPI(
    title="DC Incident Prediction — ML Service",
    description=(
        "Machine learning microservice providing anomaly detection, "
        "incident classification, and resource forecasting."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ─────────────────────────────────────────────────────────
from app.routers.anomaly import router as anomaly_router
from app.routers.classify import router as classify_router
from app.routers.forecast import router as forecast_router
from app.routers.train import router as train_router

app.include_router(anomaly_router)
app.include_router(classify_router)
app.include_router(forecast_router)
app.include_router(train_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "models": {
            "anomaly_detector": anomaly_detector.is_trained,
            "incident_classifier": incident_classifier.is_trained,
            "lstm_forecaster": lstm_forecaster.is_trained,
        },
    }
