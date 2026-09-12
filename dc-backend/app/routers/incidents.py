from typing import Optional, Dict, Any, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from loguru import logger
import uuid

from app.models.incident import Incident
from app.models.server import Server
from app.websocket.manager import ws_manager
from app.schemas.response import success_response

router = APIRouter(prefix="/incidents", tags=["Incidents"])


class CreateIncidentRequest(BaseModel):
    server_id: str
    hostname: Optional[str] = None
    severity: str = "critical"  # critical / high / medium / low
    incident_type: str = "cpu_spike"
    anomaly_score: float = 0.88
    model_used: Optional[str] = "XGBoost + TreeExplainer"
    shap_explanation: Optional[Dict[str, Any]] = None
    notes: Optional[str] = ""


class ResolveIncidentRequest(BaseModel):
    notes: Optional[str] = "Resolved by SRE operator"


DEFAULT_INCIDENTS = [
    {
        "incident_id": "INC-1082",
        "server_id": "server-03",
        "hostname": "srv-app-alpha",
        "detected_at": datetime.utcnow(),
        "resolved_at": None,
        "severity": "critical",
        "incident_type": "cpu_spike",
        "anomaly_score": 0.94,
        "model_used": "XGBoost + TreeExplainer",
        "shap_explanation": {
            "top_features": [
                {"feature": "cpu_pct", "value": 94.2, "shap_value": 0.45, "explanation": "CPU utilization at 94.2% strongly drives cpu_spike classification"},
                {"feature": "temp_celsius", "value": 82.0, "shap_value": 0.32, "explanation": "Core temperature elevated (+0.32 SHAP)"},
                {"feature": "ram_pct", "value": 88.0, "shap_value": 0.18, "explanation": "Memory saturation pressure (+0.18 SHAP)"}
            ]
        },
        "acknowledged": False,
        "notes": "Sudden computational surge on alpha gateway node.",
        "status": "open",
    },
    {
        "incident_id": "INC-1081",
        "server_id": "server-07",
        "hostname": "srv-kafka-02",
        "detected_at": datetime.utcnow(),
        "resolved_at": None,
        "severity": "high",
        "incident_type": "memory_leak",
        "anomaly_score": 0.88,
        "model_used": "Isolation Forest",
        "shap_explanation": None,
        "acknowledged": True,
        "notes": "Monotonic heap memory climb detected on Kafka broker.",
        "status": "acknowledged",
    },
    {
        "incident_id": "INC-1080",
        "server_id": "server-08",
        "hostname": "srv-ml-inference",
        "detected_at": datetime.utcnow(),
        "resolved_at": datetime.utcnow(),
        "severity": "medium",
        "incident_type": "thermal_event",
        "anomaly_score": 0.65,
        "model_used": "Bi-LSTM Attention Forecaster",
        "shap_explanation": None,
        "acknowledged": True,
        "notes": "Post-training GPU die cool-down cycle verified.",
        "status": "resolved",
    },
]


async def ensure_seed_incidents():
    count = await Incident.count()
    if count == 0:
        logger.info("Seeding initial VaultWatch incidents...")
        for inc_data in DEFAULT_INCIDENTS:
            inc = Incident(**inc_data)
            await inc.insert()


@router.get("")
async def get_incidents(
    severity: Optional[str] = Query(None, description="Filter: critical/high/medium/low"),
    status: Optional[str] = Query(None, description="Filter: open/acknowledged/resolved"),
    server_id: Optional[str] = Query(None, description="Filter by server ID"),
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
):
    await ensure_seed_incidents()

    query = {}
    if severity:
        query["severity"] = severity
    if status:
        query["status"] = status
    if server_id:
        query["server_id"] = server_id

    total = await Incident.find(query).count()
    incidents = await Incident.find(query).sort(-Incident.detected_at).skip(skip).limit(limit).to_list()

    # Format output for frontend compatibility (both `id` and `incident_id`)
    formatted = []
    for inc in incidents:
        d = inc.dict()
        d["id"] = inc.incident_id
        d["created_at"] = inc.created_at.isoformat()
        d["detected_at"] = inc.detected_at.isoformat()
        d["resolved_at"] = inc.resolved_at.isoformat() if inc.resolved_at else None
        formatted.append(d)

    return success_response(
        data={
            "total": total,
            "skip": skip,
            "limit": limit,
            "incidents": formatted,
        },
        message=f"Retrieved {len(formatted)} incidents",
    )


@router.get("/stats/summary")
async def get_incident_stats():
    await ensure_seed_incidents()

    total = await Incident.count()
    critical = await Incident.find(Incident.severity == "critical").count()
    high = await Incident.find(Incident.severity == "high").count()
    medium = await Incident.find(Incident.severity == "medium").count()
    low = await Incident.find(Incident.severity == "low").count()

    active = await Incident.find(Incident.status != "resolved").count()
    resolved = await Incident.find(Incident.status == "resolved").count()

    # By type
    all_incidents = await Incident.find_all().to_list()
    by_type: Dict[str, int] = {}
    for i in all_incidents:
        by_type[i.incident_type] = by_type.get(i.incident_type, 0) + 1

    return success_response(
        data={
            "total": total,
            "active_count": active,
            "resolved_today": resolved,
            "by_severity": {
                "critical": critical,
                "high": high,
                "medium": medium,
                "low": low,
            },
            "by_type": by_type,
        },
        message="Incident statistics summary generated",
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_incident(payload: CreateIncidentRequest):
    # Auto-generate incident ID
    inc_code = f"INC-{uuid.uuid4().hex[:4].upper()}"

    hostname = payload.hostname
    if not hostname:
        server = await Server.find_one(Server.server_id == payload.server_id)
        hostname = server.hostname if server else payload.server_id

    inc = Incident(
        incident_id=inc_code,
        server_id=payload.server_id,
        hostname=hostname,
        detected_at=datetime.utcnow(),
        severity=payload.severity,
        incident_type=payload.incident_type,
        anomaly_score=payload.anomaly_score,
        model_used=payload.model_used or "ensemble",
        shap_explanation=payload.shap_explanation,
        notes=payload.notes or "",
        status="open",
    )
    await inc.insert()

    # Update server status if critical/high
    if inc.severity in ["critical", "high"]:
        server = await Server.find_one(Server.server_id == payload.server_id)
        if server:
            await server.set({"status": "critical" if inc.severity == "critical" else "degraded"})

    # Broadcast over WebSocket
    inc_dict = inc.dict()
    inc_dict["id"] = inc.incident_id
    inc_dict["detected_at"] = inc.detected_at.isoformat()
    await ws_manager.broadcast({"type": "incident", "action": "create", "data": inc_dict})

    logger.info(f"Created incident {inc.incident_id} on {inc.server_id} [{inc.severity}]")
    return success_response(data=inc_dict, message=f"Incident {inc.incident_id} created successfully")


@router.get("/{incident_id}")
async def get_incident(incident_id: str):
    inc = await Incident.find_one(Incident.incident_id == incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found")

    d = inc.dict()
    d["id"] = inc.incident_id
    d["detected_at"] = inc.detected_at.isoformat()
    d["resolved_at"] = inc.resolved_at.isoformat() if inc.resolved_at else None
    return success_response(data=d, message=f"Incident '{incident_id}' retrieved")


@router.patch("/{incident_id}/acknowledge")
async def acknowledge_incident(incident_id: str):
    inc = await Incident.find_one(Incident.incident_id == incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found")

    await inc.set({
        "acknowledged": True,
        "status": "acknowledged" if inc.status == "open" else inc.status,
    })

    inc_dict = inc.dict()
    inc_dict["id"] = inc.incident_id
    await ws_manager.broadcast({"type": "incident", "action": "update", "data": inc_dict})

    logger.info(f"Acknowledged incident {incident_id}")
    return success_response(data=inc_dict, message=f"Incident '{incident_id}' acknowledged")


@router.patch("/{incident_id}/resolve")
async def resolve_incident(incident_id: str, payload: ResolveIncidentRequest):
    inc = await Incident.find_one(Incident.incident_id == incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found")

    now = datetime.utcnow()
    await inc.set({
        "status": "resolved",
        "resolved_at": now,
        "notes": payload.notes or inc.notes,
    })

    # Reset server status to healthy if no other active incidents
    remaining = await Incident.find(
        Incident.server_id == inc.server_id,
        Incident.status != "resolved",
        Incident.incident_id != incident_id,
    ).count()

    if remaining == 0:
        server = await Server.find_one(Server.server_id == inc.server_id)
        if server:
            await server.set({"status": "healthy"})

    inc_dict = inc.dict()
    inc_dict["id"] = inc.incident_id
    inc_dict["resolved_at"] = now.isoformat()
    await ws_manager.broadcast({"type": "incident", "action": "update", "data": inc_dict})

    logger.info(f"Resolved incident {incident_id}")
    return success_response(data=inc_dict, message=f"Incident '{incident_id}' resolved successfully")
