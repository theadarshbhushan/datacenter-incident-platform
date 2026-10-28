"""Reports and analytics computed from stored incidents, alerts, servers and predictions."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.auth import OrgContext, require_org
from app.core.errors import ApiException
from app.core.timeutil import to_naive_utc, utcnow
from app.schemas.response import success_response
from app.services import reports as svc

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/summary", summary="Incident, uptime, alert and prediction summary for a period (default: last 7 days)")
async def summary(ctx: OrgContext = Depends(require_org("reports:export")), start: Optional[datetime] = None, end: Optional[datetime] = None):
    end = to_naive_utc(end) if end else utcnow()
    start = to_naive_utc(start) if start else end - timedelta(days=7)
    if start >= end:
        raise ApiException(422, "start must be before end.", "validation_error", {"start": "Must be before end."})
    if end - start > timedelta(days=366):
        raise ApiException(422, "Reports cover at most one year.", "validation_error", {"start": "Range too long."})
    return success_response(await svc.summary(ctx.org_id, start, end))
