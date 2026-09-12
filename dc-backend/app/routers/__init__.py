from app.routers.auth import router as auth_router
from app.routers.servers import router as servers_router
from app.routers.metrics import router as metrics_router
from app.routers.incidents import router as incidents_router
from app.routers.predictions import router as predictions_router

__all__ = [
    "auth_router",
    "servers_router",
    "metrics_router",
    "incidents_router",
    "predictions_router",
]
