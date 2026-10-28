"""
Telemetry ingestion for monitoring agents and integrations.

Authenticate with an organization API key that has the `metrics:write` scope:
`X-API-Key: vw_live_...` (or `Authorization: Bearer vw_live_...`). Browser sessions cannot ingest.
"""
from fastapi import APIRouter, Depends, Request, status

from app.core import ratelimit
from app.core.auth import OrgContext, require_org
from app.core.errors import ApiException
from app.core.timeutil import utcnow
from app.core.tokens import hash_token
from app.models.account import ApiKey, Organization
from app.schemas.monitoring import LegacyMetricIn, TelemetryBatchIn, TelemetryPointIn
from app.schemas.response import success_response
from app.services import telemetry as svc

router = APIRouter(tags=["Telemetry"])


async def api_key_org(request: Request) -> Organization:
    raw = request.headers.get("x-api-key") or ""
    auth = request.headers.get("authorization", "")
    if not raw and auth.lower().startswith("bearer vw_"):
        raw = auth[7:]
    if not raw:
        raise ApiException(401, "Send an organization API key in the X-API-Key header.", "unauthenticated")
    key = await ApiKey.find_one(ApiKey.key_hash == hash_token(raw.strip()))
    if not key:
        raise ApiException(401, "Invalid API key.", "invalid_api_key")
    if "metrics:write" not in key.scopes:
        raise ApiException(403, "This API key lacks the metrics:write scope.", "forbidden")
    org = await Organization.get(key.org_id)
    if not org:
        raise ApiException(401, "Invalid API key.", "invalid_api_key")
    ratelimit.hit(f"ingest:{key.id}", 1200, 60, "Ingestion rate limit exceeded for this API key.")
    now = utcnow()
    if not key.last_used_at or (now - key.last_used_at).total_seconds() > 60:
        key.last_used_at = now
        await key.save()
    return org


@router.post("/telemetry/ingest", status_code=status.HTTP_202_ACCEPTED, summary="Ingest one point or a batch of up to 500")
async def ingest(body: TelemetryBatchIn | TelemetryPointIn, org: Organization = Depends(api_key_org)):
    points = body.points if isinstance(body, TelemetryBatchIn) else [body]
    result = await svc.ingest(org, points)
    if not result["accepted"]:
        raise ApiException(422, f"No points were accepted: {result['rejected'][0]['error']}.", "telemetry_rejected",
                           {"points": result["rejected"][0]["error"]})
    msg = f"Accepted {result['accepted']} point(s)" + (f", rejected {len(result['rejected'])}" if result["rejected"] else "")
    return success_response(result, msg)


@router.post("/metrics", status_code=status.HTTP_201_CREATED, summary="Legacy single-point ingestion (use /telemetry/ingest)", deprecated=True)
async def ingest_legacy(body: LegacyMetricIn, org: Organization = Depends(api_key_org)):
    result = await svc.ingest(org, [body.to_point()])
    if not result["accepted"]:
        raise ApiException(422, f"Point rejected: {result['rejected'][0]['error']}.", "telemetry_rejected")
    return success_response(result, "Metric ingested")


@router.get("/telemetry/health", summary="Connection and ingestion health for the caller's organization")
async def telemetry_health(ctx: OrgContext = Depends(require_org())):
    return success_response(await svc.health(ctx.org_id))
