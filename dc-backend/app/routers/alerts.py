from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from loguru import logger
from beanie import PydanticObjectId

from app.models.alert import Alert
from app.websocket.manager import ws_manager
from app.schemas.response import success_response

router = APIRouter(prefix="/alerts", tags=["Alerts"])


class CreateAlertRequest(BaseModel):
    server_id: str
    incident_id: Optional[str] = None
    severity: str = "medium"
    message: str
    anomaly_score: Optional[float] = 0.8
    recommendation: Optional[str] = ""


DEFAULT_ALERTS = [
    {
        "server_id": "server-03",
        "incident_id": "INC-1082",
        "severity": "critical",
        "message": "Predicted CPU spike outage risk within 18 minutes (87.4% risk probability)",
        "anomaly_score": 0.94,
        "recommendation": "Migrate container workloads and ramp up auxiliary cooling fans.",
        "acknowledged": False,
    },
    {
        "server_id": "server-07",
        "incident_id": "INC-1081",
        "severity": "high",
        "message": "Memory leak detected on Kafka broker node (climbing steadily past 88%)",
        "anomaly_score": 0.88,
        "recommendation": "Inspect topic partition buffers and restart consumer pod.",
        "acknowledged": False,
    },
    {
        "server_id": "server-08",
        "incident_id": "INC-1080",
        "severity": "medium",
        "message": "Thermal elevation past 78°C following GPU batch completion",
        "anomaly_score": 0.65,
        "recommendation": "Thermal dissipation nominal; monitor die sensor telemetry.",
        "acknowledged": True,
    },
]


async def ensure_seed_alerts():
    count = await Alert.count()
    if count == 0:
        logger.info("Seeding initial VaultWatch alerts...")
        for a_data in DEFAULT_ALERTS:
            a = Alert(**a_data)
            await a.insert()


@router.get("")
async def get_alerts(
    severity: Optional[str] = Query(None, description="critical/high/medium/low"),
    acknowledged: Optional[bool] = Query(None, description="True or False"),
    limit: int = Query(50, ge=1, le=500),
):
    await ensure_seed_alerts()

    query = {}
    if severity:
        query["severity"] = severity
    if acknowledged is not None:
        query["acknowledged"] = acknowledged

    alerts = await Alert.find(query).sort(-Alert.created_at).limit(limit).to_list()

    formatted = []
    for a in alerts:
        d = a.dict()
        d["id"] = str(a.id)
        d["created_at"] = a.created_at.isoformat()
        formatted.append(d)

    return success_response(data=formatted, message=f"Retrieved {len(formatted)} alerts")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_alert(payload: CreateAlertRequest):
    alert = Alert(
        server_id=payload.server_id,
        incident_id=payload.incident_id,
        severity=payload.severity,
        message=payload.message,
        anomaly_score=payload.anomaly_score or 0.8,
        recommendation=payload.recommendation or "",
        acknowledged=False,
    )
    await alert.insert()

    alert_dict = alert.dict()
    alert_dict["id"] = str(alert.id)
    alert_dict["created_at"] = alert.created_at.isoformat()

    await ws_manager.broadcast({"type": "alert", "data": alert_dict})
    logger.info(f"Created alert on {alert.server_id}: {alert.message}")

    return success_response(data=alert_dict, message="Alert generated successfully")


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    alert = None
    try:
        obj_id = PydanticObjectId(alert_id)
        alert = await Alert.get(obj_id)
    except Exception:
        pass

    if not alert:
        alert = await Alert.find_one(Alert.incident_id == alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")

    await alert.set({"acknowledged": True})

    alert_dict = alert.dict()
    alert_dict["id"] = str(alert.id)
    alert_dict["created_at"] = alert.created_at.isoformat()

    return success_response(data=alert_dict, message=f"Alert '{alert_id}' acknowledged")
