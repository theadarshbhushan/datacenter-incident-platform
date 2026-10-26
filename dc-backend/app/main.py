from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.auth import CSRF_HEADER, check_csrf, current_auth, origin_allowed, require_internal, resolve_org
from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.errors import ApiException
from app.core.tokens import safe_equals
from app.routers import app_routers, internal_routers
from app.schemas.response import success_response
from app.websocket.manager import INTERNAL, ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down")
    try:
        await close_db()
    except Exception as e:
        logger.warning(f"Error closing database: {e}")


app = FastAPI(
    title="VaultWatch API",
    description="VaultWatch data center incident monitoring API",
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def error_body(message: str, code: str = "error", fields=None) -> dict:
    return {"success": False, "data": None, "message": message, "code": code, "fields": fields, "timestamp": datetime.utcnow().isoformat()}


UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def csrf_and_headers(request: Request, call_next):
    """CSRF for cookie-authenticated API calls. API-key and internal-token requests carry no cookies."""
    if request.method in UNSAFE and request.url.path.startswith("/api/"):
        machine = request.headers.get("x-api-key") or request.headers.get("x-internal-token") or request.headers.get("authorization", "").lower().startswith("bearer vw_")
        if not origin_allowed(request):
            return JSONResponse(status_code=403, content=error_body("Request origin is not allowed.", "csrf_failed"))
        if not machine and not check_csrf(request):
            return JSONResponse(status_code=403, content=error_body("Your security token expired. Please try again.", "csrf_failed"))
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# Credentials (cookies) are only ever allowed for explicit origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Accept", CSRF_HEADER, "X-API-Key"],
)


@app.exception_handler(ApiException)
async def api_exception_handler(request: Request, exc: ApiException):
    return JSONResponse(status_code=exc.status_code, content=error_body(exc.message, exc.code, exc.fields))


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code = {401: "unauthenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "error")
    return JSONResponse(status_code=exc.status_code, content=error_body(str(exc.detail), code))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    fields = {}
    for err in exc.errors():
        loc = [str(x) for x in err.get("loc", []) if x not in ("body", "query", "path")]
        if loc and loc[-1] not in fields:
            fields[loc[-1]] = err.get("msg", "Invalid value").removeprefix("Value error, ")
    first = next(iter(fields.items()), None)
    message = f"Check the {first[0]} field: {first[1]}" if first else "The request was not valid."
    return JSONResponse(status_code=422, content=error_body(message, "validation_error", fields or None))


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Log details server-side only; never return exception text to clients.
    logger.exception(f"Unhandled server error at {request.method} {request.url.path}")
    return JSONResponse(status_code=500, content=error_body("The server had a problem. Please try again.", "server_error"))


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "success": True,
        "data": {"status": "healthy", "version": settings.VERSION, "service": "vaultwatch-backend"},
        "message": "VaultWatch API is operational",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Live updates. Browser clients use their session cookie and receive only their organization's events."""
    scope = None
    token = websocket.headers.get("x-internal-token", "")
    if settings.INTERNAL_API_TOKEN and token and safe_equals(token, settings.INTERNAL_API_TOKEN):
        scope = INTERNAL
    else:
        origin = websocket.headers.get("origin")
        if origin and origin.rstrip("/") not in settings.cors_origins:
            await websocket.close(code=1008)
            return
        ctx = await current_auth(websocket)  # type: ignore[arg-type]  (reads cookies like a Request)
        resolved = await resolve_org(ctx) if ctx else None
        if resolved:
            scope = resolved[0].id
    if not scope:
        await websocket.close(code=1008)
        return
    await ws_manager.connect(websocket, scope)
    try:
        while True:
            await websocket.receive_text()
            await websocket.send_json({"type": "pong", "data": {"status": "connected", "timestamp": datetime.utcnow().isoformat()}})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client error: {e}")
        ws_manager.disconnect(websocket)


for r in app_routers:
    app.include_router(r, prefix="/api/v1")
for r in internal_routers:
    app.include_router(r, prefix="/api/v1", dependencies=[Depends(require_internal)])


@app.get("/", include_in_schema=False)
async def root():
    return success_response(data={"service": "VaultWatch API", "version": settings.VERSION, "health": "/health"}, message="VaultWatch API")
