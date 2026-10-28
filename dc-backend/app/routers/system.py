"""Health, readiness and integration status."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core.auth import OrgContext, require_org
from app.core.config import settings
from app.core.database import ping
from app.core.timeutil import iso, utcnow
from app.ml.inference import registry
from app.schemas.response import success_response
from app.services import telemetry

router = APIRouter(tags=["Health"])


async def readiness() -> dict:
    db_ok = await ping()
    ml = registry.status()
    return {
        "status": "ready" if db_ok and ml["ready"] else "degraded" if db_ok else "unavailable",
        "database": "ok" if db_ok else "unreachable",
        "model": {"ready": ml["ready"], "version": ml.get("version"), "error": ml.get("error")},
        "version": settings.VERSION, "checkedAt": iso(utcnow()),
    }


@router.get("/health/ready", summary="Readiness: database reachable and model loaded (HTTP 503 otherwise)")
async def ready():
    r = await readiness()
    return JSONResponse(status_code=200 if r["status"] == "ready" else 503, content=success_response(r) if r["status"] == "ready" else {**success_response(r), "success": False})


@router.get("/integrations/status", summary="What is configured and working for the caller's organization")
async def integrations_status(ctx: OrgContext = Depends(require_org())):
    r = await readiness()
    return success_response({
        **r,
        "telemetry": await telemetry.health(ctx.org_id),
        "email": {"backend": settings.EMAIL_BACKEND, "delivers": settings.EMAIL_BACKEND == "smtp" and bool(settings.SMTP_HOST)},
        "slack": {"configured": bool(settings.SLACK_WEBHOOK_URL)},
        "pagerduty": {"configured": bool(settings.PAGERDUTY_ROUTING_KEY)},
        "logs": {"configured": False},
        "billing": {"configured": bool(settings.BILLING_PROVIDER)},
    })
