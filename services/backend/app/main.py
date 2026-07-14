from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.core.config import get_settings
from app.core.database import init_db
from app.routers import (
    auth_router,
    servers_router,
    metrics_router,
    incidents_router,
    predictions_router,
)
from app.websocket.manager import get_websocket_manager

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info("Starting up Data Center Incident Platform Backend...")
    try:
        await init_db()
        logger.info("Successfully connected to database.")
    except Exception as e:
        logger.critical(f"Failed to initialize database during startup: {e}")
        raise e
    yield
    # Shutdown actions
    logger.info("Shutting down backend...")

app = FastAPI(
    title="Data Center Incident Platform API",
    description="Backend API for monitoring, predicting, and tracking server incidents.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(auth_router)
app.include_router(servers_router)
app.include_router(metrics_router)
app.include_router(incidents_router)
app.include_router(predictions_router)

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENVIRONMENT,
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    manager = get_websocket_manager()
    await manager.connect(websocket)
    try:
        while True:
            # Await any messages from client (heartbeat/keepalive)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
