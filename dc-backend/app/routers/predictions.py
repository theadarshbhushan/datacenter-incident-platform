from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone, timedelta
import httpx
from loguru import logger
from beanie import PydanticObjectId

from app.core.config import get_settings
from app.models.server import Server
from app.models.metric import Metric
from app.models.incident import Incident, IncidentSeverity, IncidentType
from app.schemas.prediction import (
    PredictionRequest,
    PredictionResponse,
    AnomalyResult,
    ClassificationResult,
    ForecastResult,
    ForecastPoint,
)
from app.websocket.manager import get_websocket_manager
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/predictions", tags=["Predictions"])

def _build_feature_vector(metrics: list[Metric]) -> list[float]:
    if not metrics:
        return [0.0] * 7

    latest = metrics[-1]
    # Grab metric about 1 hour ago (if 5-min intervals, it's 12 steps ago)
    hour_ago_idx = max(0, len(metrics) - 12)
    hour_ago = metrics[hour_ago_idx]

    cpu_trend = latest.cpu_pct - hour_ago.cpu_pct
    ram_trend = latest.ram_pct - hour_ago.ram_pct

    return [
        latest.cpu_pct,
        latest.ram_pct,
        latest.disk_io_mbps,
        latest.net_mbps,
        latest.temp_celsius,
        cpu_trend,
        ram_trend,
    ]

def _metrics_to_series(metrics: list[Metric]) -> list[dict]:
    # Take the last 60 points
    return [
        {
            "timestamp": m.timestamp.isoformat(),
            "cpu_pct": m.cpu_pct,
            "ram_pct": m.ram_pct,
            "disk_io_mbps": m.disk_io_mbps,
            "net_mbps": m.net_mbps,
            "temp_celsius": m.temp_celsius,
            "disk_used_pct": m.disk_used_pct,
        }
        for m in metrics[-60:]
    ]

@router.post("", response_model=PredictionResponse)
async def run_prediction(payload: PredictionRequest, current_user: User = Depends(get_current_user)):
    settings = get_settings()
    
    server = await Server.find_one(Server.hostname == payload.server_id)
    if not server and PydanticObjectId.is_valid(payload.server_id):
        server = await Server.get(PydanticObjectId(payload.server_id))
    if not server:
        raise HTTPException(status_code=404, detail=f"Server '{payload.server_id}' not found")

    # Fetch last 24 hours of metrics to calculate trends
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    metrics = await Metric.find(
        Metric.server_id == server.hostname,
        Metric.timestamp >= cutoff
    ).sort("+timestamp").to_list()

    if len(metrics) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient metrics for server '{server.hostname}'. At least 2 points are required."
        )

    anomaly: AnomalyResult | None = None
    classification: ClassificationResult | None = None
    forecast: ForecastResult | None = None
    incident_created = False
    incident_id: str | None = None

    async with httpx.AsyncClient(base_url=settings.ML_SERVICE_URL, timeout=30.0) as client:
        if payload.include_anomaly_detection:
            try:
                anomaly_response = await client.post(
                    "/anomaly/detect",
                    json={
                        "server_id": server.hostname,
                        "metrics": _metrics_to_series(metrics),
                    },
                )
                anomaly_response.raise_for_status()
                anomaly_data = anomaly_response.json().get("data", anomaly_response.json())
                anomaly = AnomalyResult(
                    anomaly_score=float(anomaly_data["anomaly_score"]),
                    is_anomaly=bool(anomaly_data["is_anomaly"]),
                )
            except Exception as e:
                logger.error(f"Error calling anomaly service: {e}")
                # Don't fail the whole request if one service has an issue
                pass

        if payload.include_classification:
            try:
                classification_response = await client.post(
                    "/classify",
                    json={
                        "server_id": server.hostname,
                        "features": _build_feature_vector(metrics),
                    },
                )
                classification_response.raise_for_status()
                classification_data = classification_response.json().get(
                    "data", classification_response.json()
                )
                classification = ClassificationResult(
                    incident_type=str(classification_data["incident_type"]),
                    confidence=float(classification_data["confidence"]),
                )
            except Exception as e:
                logger.error(f"Error calling classification service: {e}")
                pass

        if payload.include_forecast:
            try:
                forecast_response = await client.post(
                    "/forecast",
                    json={
                        "server_id": server.hostname,
                        "metrics": _metrics_to_series(metrics)[-60:],
                    },
                )
                forecast_response.raise_for_status()
                forecast_data = forecast_response.json().get("data", forecast_response.json())
                
                forecast_points = [
                    ForecastPoint(
                        timestamp=pt["timestamp"],
                        cpu_pct=float(pt["cpu_pct"]),
                        ram_pct=float(pt["ram_pct"])
                    )
                    for pt in forecast_data["forecast"]
                ]
                
                forecast = ForecastResult(
                    forecast=forecast_points,
                    confidence_interval=float(forecast_data["confidence_interval"]),
                )
            except Exception as e:
                logger.error(f"Error calling forecast service: {e}")
                pass

    if anomaly and anomaly.is_anomaly:
        # Determine severity based on score
        severity = IncidentSeverity.MEDIUM
        if anomaly.anomaly_score > 0.8:
            severity = IncidentSeverity.CRITICAL
        elif anomaly.anomaly_score > 0.6:
            severity = IncidentSeverity.HIGH

        incident_type = IncidentType.PREDICTED_OUTAGE
        if classification:
            # Map string to IncidentType Enum
            try:
                incident_type = IncidentType(classification.incident_type)
            except ValueError:
                pass
                
        # Check if there is already an active, unresolved incident of this type for the server
        existing_incident = await Incident.find_one(
            Incident.server_id == server.hostname,
            Incident.incident_type == incident_type,
            Incident.resolved_at == None
        )

        if not existing_incident:
            incident = Incident(
                server_id=server.hostname,
                severity=severity,
                incident_type=incident_type,
                anomaly_score=anomaly.anomaly_score,
                model_used="isolation_forest+xgboost",
                notes=f"Auto-generated prediction alert. Classification confidence: {classification.confidence if classification else 'N/A'}"
            )
            await incident.insert()
            incident_created = True
            incident_id = str(incident.id)
            
            # Broadcast the new incident to WS clients
            manager = get_websocket_manager()
            await manager.broadcast({
                "type": "incident",
                "action": "create",
                "data": {
                    "id": incident_id,
                    "server_id": incident.server_id,
                    "detected_at": incident.detected_at.isoformat(),
                    "resolved_at": None,
                    "severity": incident.severity.value,
                    "incident_type": incident.incident_type.value,
                    "anomaly_score": incident.anomaly_score,
                    "model_used": incident.model_used,
                    "acknowledged": incident.acknowledged,
                    "notes": incident.notes
                }
            })
            
            # Update server status
            if severity in [IncidentSeverity.HIGH, IncidentSeverity.CRITICAL]:
                server.status = "anomalous"
                await server.save()
        else:
            incident_id = str(existing_incident.id)

    return PredictionResponse(
        server_id=server.hostname,
        anomaly=anomaly,
        classification=classification,
        forecast=forecast,
        incident_created=incident_created,
        incident_id=incident_id,
    )
