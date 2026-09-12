"""
POST /train

Triggers training of all three ML models.  Data is pulled from
MongoDB when available; otherwise synthetic data is generated to
bootstrap the models.
"""

import os
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from loguru import logger
from motor.motor_asyncio import AsyncIOMotorClient
import mlflow

from app.utils.preprocessor import (
    generate_synthetic_metrics,
    prepare_anomaly_features,
    prepare_classification_training_data,
    prepare_forecast_sequences,
)

router = APIRouter(tags=["Training"])

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://dcadmin:changeme_mongo_password@mongodb:27017/datacenter_incidents?authSource=admin",
)
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "datacenter_incidents")
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "file:/app/mlruns")


class TrainResponse(BaseModel):
    status: str
    data_source: str
    results: dict


async def _fetch_metrics_from_mongo(min_rows: int = 200) -> list[dict] | None:
    """
    Try to fetch recent metrics from MongoDB.
    Returns None if fewer than *min_rows* documents are found.
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[MONGO_DB_NAME]
        cursor = db.metrics.find().sort("timestamp", -1).limit(5000)
        docs = await cursor.to_list(length=5000)
        await client.close()

        if len(docs) < min_rows:
            logger.info(
                f"Only {len(docs)} metrics in MongoDB (need {min_rows}). "
                "Falling back to synthetic data."
            )
            return None

        # Convert ObjectIds and datetimes for downstream processing
        metrics = []
        for d in reversed(docs):  # chronological order
            metrics.append({
                "timestamp": d["timestamp"].isoformat() if hasattr(d["timestamp"], "isoformat") else str(d["timestamp"]),
                "cpu_pct": float(d.get("cpu_pct", 0)),
                "ram_pct": float(d.get("ram_pct", 0)),
                "disk_io_mbps": float(d.get("disk_io_mbps", 0)),
                "net_mbps": float(d.get("net_mbps", 0)),
                "temp_celsius": float(d.get("temp_celsius", 0)),
                "disk_used_pct": float(d.get("disk_used_pct", 0)),
            })
        logger.info(f"Fetched {len(metrics)} metrics from MongoDB")
        return metrics

    except Exception as e:
        logger.warning(f"Could not connect to MongoDB: {e}")
        return None


@router.post("/train", response_model=TrainResponse)
async def train_models(use_synthetic: bool = Query(default=False)):
    from app.main import anomaly_detector, incident_classifier, lstm_forecaster

    # ── Resolve data source ──────────────────────────────────────────────
    metrics: list[dict] | None = None
    data_source = "synthetic"

    if not use_synthetic:
        metrics = await _fetch_metrics_from_mongo()

    if metrics is None:
        metrics = generate_synthetic_metrics(n_samples=2000)
        data_source = "synthetic"
    else:
        data_source = "mongodb"

    logger.info(f"Training with {len(metrics)} samples from {data_source}")

    # ── MLflow run ───────────────────────────────────────────────────────
    try:
        mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
        mlflow.set_experiment("dc-incident-prediction")
    except Exception as e:
        logger.warning(f"MLflow setup skipped: {e}")

    results = {}

    try:
        with mlflow.start_run(run_name="train-all-models"):
            # ── 1. Isolation Forest ──────────────────────────────────────
            logger.info("=" * 60)
            logger.info("Training Isolation Forest...")
            X_anomaly = prepare_anomaly_features(metrics)
            results["isolation_forest"] = anomaly_detector.train(X_anomaly)

            # ── 2. XGBoost Classifier ────────────────────────────────────
            logger.info("=" * 60)
            logger.info("Training XGBoost Classifier...")
            X_cls, y_cls = prepare_classification_training_data(metrics)
            results["xgboost_classifier"] = incident_classifier.train(X_cls, y_cls)

            # ── 3. LSTM Forecaster ───────────────────────────────────────
            logger.info("=" * 60)
            logger.info("Training LSTM Forecaster...")
            X_lstm, y_lstm = prepare_forecast_sequences(metrics)
            if y_lstm is not None:
                results["lstm_forecaster"] = lstm_forecaster.train(
                    X_lstm, y_lstm, epochs=30
                )
            else:
                results["lstm_forecaster"] = {
                    "model": "lstm_forecaster",
                    "status": "skipped — not enough data for sliding windows",
                }
    except Exception:
        # If MLflow context fails, train without it
        logger.warning("MLflow run context failed; training without experiment tracking")
        X_anomaly = prepare_anomaly_features(metrics)
        results["isolation_forest"] = anomaly_detector.train(X_anomaly)

        X_cls, y_cls = prepare_classification_training_data(metrics)
        results["xgboost_classifier"] = incident_classifier.train(X_cls, y_cls)

        X_lstm, y_lstm = prepare_forecast_sequences(metrics)
        if y_lstm is not None:
            results["lstm_forecaster"] = lstm_forecaster.train(X_lstm, y_lstm, epochs=30)
        else:
            results["lstm_forecaster"] = {
                "model": "lstm_forecaster",
                "status": "skipped — not enough data for sliding windows",
            }

    logger.info("=" * 60)
    logger.info("All models trained successfully")
    return TrainResponse(status="ok", data_source=data_source, results=results)
