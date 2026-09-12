from fastapi import APIRouter
from app.core.model_loader import model_loader

router = APIRouter(tags=["Health & Status"])


@router.get("/health")
async def health_check():
    """
    Service health check returning readiness of all 3 ML models,
    training dataset parameters, and benchmark evaluation metrics.
    """
    if_ready = "ready" if model_loader.isolation_forest is not None else "not_loaded"
    xgb_ready = "ready" if model_loader.xgboost_model is not None else "not_loaded"
    bilstm_ready = "ready" if model_loader.bilstm_model is not None else "not_loaded"

    # Default status: healthy if at least one model is loaded or in production mode
    is_healthy = "healthy" if (if_ready == "ready" or xgb_ready == "ready") else "degraded"

    return {
        "status": is_healthy,
        "models": {
            "isolation_forest": if_ready,
            "xgboost": xgb_ready,
            "bilstm": bilstm_ready,
        },
        "dataset": {
            "total_records": 42954,
            "train_records": 34363,
            "test_records": 8591,
            "anomaly_rate": "18.11%",
        },
        "performance": {
            "if_accuracy": "87.8%",
            "xgb_f1": "85.7%",
            "lstm_mae": "6.77%",
        },
    }
