from fastapi import APIRouter, Depends, HTTPException, Query, status
from datetime import datetime, timezone
from app.models.metric import Metric
from app.schemas.metric import MetricCreate, MetricOut
from app.websocket.manager import get_websocket_manager
from app.models.server import Server
from beanie import PydanticObjectId

router = APIRouter(prefix="/metrics", tags=["Metrics"])

def to_metric_out(m: Metric) -> MetricOut:
    return MetricOut(
        id=str(m.id),
        server_id=m.server_id,
        cpu_pct=m.cpu_pct,
        ram_pct=m.ram_pct,
        disk_io_mbps=m.disk_io_mbps,
        net_mbps=m.net_mbps,
        temp_celsius=m.temp_celsius,
        disk_used_pct=m.disk_used_pct,
        timestamp=m.timestamp
    )

@router.post("", response_model=MetricOut, status_code=status.HTTP_201_CREATED)
async def create_metric(payload: MetricCreate):
    # Verify server exists
    server = await Server.find_one(Server.hostname == payload.server_id)
    if not server:
        if PydanticObjectId.is_valid(payload.server_id):
            server = await Server.get(PydanticObjectId(payload.server_id))
    if not server:
        raise HTTPException(status_code=404, detail=f"Server '{payload.server_id}' not found")
    
    timestamp = payload.timestamp or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    
    # Store metric using the server's hostname to keep referencing standardized
    metric = Metric(
        timestamp=timestamp,
        server_id=server.hostname,
        cpu_pct=payload.cpu_pct,
        ram_pct=payload.ram_pct,
        disk_io_mbps=payload.disk_io_mbps,
        net_mbps=payload.net_mbps,
        temp_celsius=payload.temp_celsius,
        disk_used_pct=payload.disk_used_pct
    )
    await metric.insert()
    
    # Broadcast to websocket clients
    manager = get_websocket_manager()
    metric_out = to_metric_out(metric)
    await manager.broadcast({
        "type": "metric",
        "data": metric_out.model_dump(mode="json")
    })
    
    return metric_out

@router.get("", response_model=list[MetricOut])
async def get_metrics(
    server_id: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=1000)
):
    query_filters = []
    if server_id:
        server = await Server.find_one(Server.hostname == server_id)
        if not server:
            if PydanticObjectId.is_valid(server_id):
                server = await Server.get(PydanticObjectId(server_id))
        resolved_server_id = server.hostname if server else server_id
        query_filters.append(Metric.server_id == resolved_server_id)
        
    if start_time:
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        query_filters.append(Metric.timestamp >= start_time)
    if end_time:
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        query_filters.append(Metric.timestamp <= end_time)
        
    if query_filters:
        query = Metric.find(*query_filters)
    else:
        query = Metric.find_all()
        
    metrics = await query.sort("-timestamp").limit(limit).to_list()
    # Reverse so they are in chronological order
    metrics.reverse()
    return [to_metric_out(m) for m in metrics]
