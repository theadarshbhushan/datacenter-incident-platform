from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from app.models.incident import Incident, IncidentSeverity, IncidentType
from app.schemas.incident import IncidentCreate, IncidentUpdate, IncidentOut
from app.routers.auth import get_current_user
from app.models.user import User
from app.websocket.manager import get_websocket_manager
from beanie import PydanticObjectId
from app.models.server import Server

router = APIRouter(prefix="/incidents", tags=["Incidents"])

def to_incident_out(i: Incident) -> IncidentOut:
    return IncidentOut(
        id=str(i.id),
        server_id=i.server_id,
        detected_at=i.detected_at,
        resolved_at=i.resolved_at,
        severity=i.severity,
        incident_type=i.incident_type,
        anomaly_score=i.anomaly_score,
        model_used=i.model_used,
        acknowledged=i.acknowledged,
        notes=i.notes
    )

@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(payload: IncidentCreate, current_user: User = Depends(get_current_user)):
    server = await Server.find_one(Server.hostname == payload.server_id)
    if not server and PydanticObjectId.is_valid(payload.server_id):
        server = await Server.get(PydanticObjectId(payload.server_id))
    resolved_server_id = server.hostname if server else payload.server_id
    
    incident = Incident(
        server_id=resolved_server_id,
        severity=payload.severity,
        incident_type=payload.incident_type,
        anomaly_score=payload.anomaly_score,
        model_used=payload.model_used,
        notes=payload.notes
    )
    await incident.insert()
    
    # Update server status to anomalous if severity is high/critical
    if server and payload.severity in [IncidentSeverity.HIGH, IncidentSeverity.CRITICAL]:
        server.status = "anomalous"
        await server.save()
        
    incident_out = to_incident_out(incident)
    manager = get_websocket_manager()
    await manager.broadcast({
        "type": "incident",
        "action": "create",
        "data": incident_out.model_dump(mode="json")
    })
    
    return incident_out

@router.get("", response_model=list[IncidentOut])
async def list_incidents(
    server_id: str | None = None,
    severity: IncidentSeverity | None = None,
    acknowledged: bool | None = None,
    incident_type: IncidentType | None = None,
    current_user: User = Depends(get_current_user)
):
    filters = []
    if server_id:
        server = await Server.find_one(Server.hostname == server_id)
        if not server and PydanticObjectId.is_valid(server_id):
            server = await Server.get(PydanticObjectId(server_id))
        resolved_server_id = server.hostname if server else server_id
        filters.append(Incident.server_id == resolved_server_id)
    if severity:
        filters.append(Incident.severity == severity)
    if acknowledged is not None:
        filters.append(Incident.acknowledged == acknowledged)
    if incident_type:
        filters.append(Incident.incident_type == incident_type)
        
    if filters:
        incidents = await Incident.find(*filters).sort("-detected_at").to_list()
    else:
        incidents = await Incident.find_all().sort("-detected_at").to_list()
        
    return [to_incident_out(i) for i in incidents]

@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(incident_id: str, current_user: User = Depends(get_current_user)):
    if not PydanticObjectId.is_valid(incident_id):
        raise HTTPException(status_code=400, detail="Invalid incident ID format")
    incident = await Incident.get(PydanticObjectId(incident_id))
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return to_incident_out(incident)

@router.put("/{incident_id}", response_model=IncidentOut)
async def update_incident(incident_id: str, payload: IncidentUpdate, current_user: User = Depends(get_current_user)):
    if not PydanticObjectId.is_valid(incident_id):
        raise HTTPException(status_code=400, detail="Invalid incident ID format")
    incident = await Incident.get(PydanticObjectId(incident_id))
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    if payload.acknowledged is not None:
        incident.acknowledged = payload.acknowledged
    if payload.notes is not None:
        incident.notes = payload.notes
    if payload.resolved is not None:
        if payload.resolved:
            incident.resolved_at = datetime.now(timezone.utc)
            # Re-evaluate server status if all incidents for this server are resolved
            server = await Server.find_one(Server.hostname == incident.server_id)
            if server:
                active_incidents = await Incident.find(
                    Incident.server_id == server.hostname,
                    Incident.resolved_at == None
                ).to_list()
                remaining_active = [ai for ai in active_incidents if str(ai.id) != incident_id]
                if not remaining_active:
                    server.status = "active"
                    await server.save()
        else:
            incident.resolved_at = None
            
    await incident.save()
    incident_out = to_incident_out(incident)
    
    manager = get_websocket_manager()
    await manager.broadcast({
        "type": "incident",
        "action": "update",
        "data": incident_out.model_dump(mode="json")
    })
    
    return incident_out
