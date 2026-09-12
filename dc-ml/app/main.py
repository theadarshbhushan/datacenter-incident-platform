from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.core.model_loader import model_loader
from app.routers import (
    health_router,
    anomaly_router,
    forecast_router,
    ensemble_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing VaultWatch ML Inference Engine...")
    model_loader.load_all()

    status = {
        "Isolation Forest": "LOADED" if model_loader.isolation_forest is not None else "FAILED",
        "XGBoost Classifier": "LOADED" if model_loader.xgboost_model is not None else "FAILED",
        "Bi-LSTM Forecaster": "LOADED" if model_loader.bilstm_model is not None else "FAILED",
    }
    for model_name, state in status.items():
        logger.info(f"Model Status: [{model_name}] -> {state}")

    yield
    logger.info("VaultWatch ML Inference Engine shutting down.")


app = FastAPI(
    title="VaultWatch ML Inference Service",
    description="Production Multi-Model Anomaly Detection, TreeExplainer SHAP Attribution, and Bi-LSTM Temporal Attention Forecasting",
    version="2.4.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(health_router)
app.include_router(anomaly_router)
app.include_router(forecast_router)
app.include_router(ensemble_router)


@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": "VaultWatch ML Inference Service",
        "version": "2.4.0",
        "status": "online",
        "docs": "/docs",
        "models_ready": model_loader.is_ready(),
    }
