"""Model output. Predictions are produced by app.services.pipeline; this router reads them and can trigger a run."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

from app.core.auth import OrgContext, require_org
from app.core.errors import ApiException, not_found
from app.ml.inference import registry
from app.models.monitoring import Prediction
from app.schemas.monitoring import PredictionRunIn
from app.schemas.response import success_response
from app.services import pipeline
from app.services.accounts import audit
from app.services.workspace import model_public, prediction_public

router = APIRouter(tags=["Predictions"])


@router.get("/predictions", summary="Current predictions, or the prediction log with history=true")
async def list_predictions(
    ctx: OrgContext = Depends(require_org()),
    kind: Optional[Literal["anomaly", "early_warning"]] = None,
    server_id: Optional[str] = Query(default=None, alias="serverId"),
    history: bool = False,
    limit: int = Query(default=500, ge=1, le=2000),
):
    q: dict = {"org_id": ctx.org_id}
    if not history:
        q["current"] = True
    if kind:
        q["kind"] = kind
    if server_id:
        q["server_id"] = server_id
    rows = await Prediction.find(q).sort("-generated_at").limit(limit).to_list()
    return success_response({"model": model_public(), "predictions": [prediction_public(p) for p in rows]})


@router.post("/predictions/run", summary="Score the latest complete telemetry bucket of every (or the given) server now")
async def run_predictions(body: PredictionRunIn, ctx: OrgContext = Depends(require_org("predictions:run"))):
    if not registry.ready:
        raise ApiException(503, "The ML model is not loaded, so no predictions can be made. See GET /ml/status.", "model_unavailable")
    result = await pipeline.run_for_org(ctx.org_id, body.serverIds or None)
    await audit(ctx.org_id, ctx.user.full_name, f"Ran predictions for {result['scored']} server(s)")
    return success_response(result, f"Scored {result['scored']} of {result['servers']} server(s)")


@router.get("/predictions/{prediction_id}")
async def get_prediction(prediction_id: str, ctx: OrgContext = Depends(require_org())):
    p = await Prediction.find_one({"_id": prediction_id, "org_id": ctx.org_id})
    if not p:
        raise not_found("Prediction not found. It may have expired from the prediction log.")
    return success_response(prediction_public(p))


@router.get("/ml/status", summary="Model readiness, version and the evaluation results it was trained with")
async def ml_status(ctx: OrgContext = Depends(require_org())):
    return success_response(registry.status())
