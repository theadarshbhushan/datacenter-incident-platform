from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from prometheus_fastapi_instrumentator import Instrumentator
from loguru import logger

from app.core.config import settings
from app.core.database import init_db, close_db
from app.schemas.response import success_response, error_response
from app.websocket.manager import ws_manager

from app.routers import (
    auth_router,
    servers_router,
    metrics_router,
    incidents_router,
    predictions_router,
    analytics_router,
    alerts_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing VaultWatch Backend services...")
    try:
        await init_db()
    except Exception as e:
        logger.error(f"Failed to initialize database on startup: {e}")
    yield
    logger.info("Shutting down VaultWatch Backend services...")
    try:
        await close_db()
    except Exception as e:
        logger.warning(f"Error closing database: {e}")


app = FastAPI(
    title="VaultWatch Backend API",
    description="Production-Grade FastAPI Backend for VaultWatch Data Center Incident Prediction Platform",
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Prometheus metrics instrumentation
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# CORS middleware (allow all origins for dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(message=str(exc.detail)),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=error_response(message="Request validation error", data=exc.errors()),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server error at {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response(message="Internal server error", data=str(exc)),
    )


# Health endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "success": True,
        "data": {
            "status": "healthy",
            "version": settings.VERSION,
            "environment": settings.ENVIRONMENT,
            "service": "vaultwatch-backend",
        },
        "message": "VaultWatch Backend API is operational",
        "timestamp": datetime.utcnow().isoformat(),
    }


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Respond to ping heartbeats
            await websocket.send_json({
                "type": "pong",
                "data": {"status": "connected", "timestamp": datetime.utcnow().isoformat()}
            })
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client error: {e}")
        ws_manager.disconnect(websocket)


# Register all routers with /api/v1 prefix
app.include_router(auth_router, prefix="/api/v1")
app.include_router(servers_router, prefix="/api/v1")
app.include_router(metrics_router, prefix="/api/v1")
app.include_router(incidents_router, prefix="/api/v1")
app.include_router(predictions_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(alerts_router, prefix="/api/v1")


@app.get("/", include_in_schema=False)
async def root():
    return success_response(
        data={
            "platform": "VaultWatch Data Center Incident Prediction Platform",
            "version": settings.VERSION,
            "docs": "/docs",
            "health": "/health",
            "metrics": "/metrics",
        },
        message="Welcome to VaultWatch Backend API",
    )
