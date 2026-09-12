from app.routers.health import router as health_router
from app.routers.anomaly import router as anomaly_router
from app.routers.forecast import router as forecast_router
from app.routers.ensemble import router as ensemble_router

__all__ = [
    "health_router",
    "anomaly_router",
    "forecast_router",
    "ensemble_router",
]
