"""Data centers, racks, servers and metric history. Reads need membership; changes need infra:manage."""
from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.auth import OrgContext, require_org
from app.core.errors import ApiException
from app.models.monitoring import METRICS, DataCenter, Rack, Server
from app.schemas.monitoring import DataCenterIn, DataCenterPatch, RackIn, RackPatch, ServerIn, ServerPatch
from app.schemas.response import success_response
from app.services import infrastructure as svc
from app.services.accounts import audit

router = APIRouter(tags=["Infrastructure"])
Window = Literal["1h", "6h", "24h", "7d"]


@router.get("/infrastructure", summary="Data centers, racks and servers with current health")
async def infrastructure(ctx: OrgContext = Depends(require_org())):
    return success_response(await svc.inventory(ctx.org_id))


# ---------- data centers ----------

@router.post("/datacenters", status_code=201)
async def create_dc(body: DataCenterIn, ctx: OrgContext = Depends(require_org("infra:manage"))):
    d = DataCenter(org_id=ctx.org_id, name=body.name, location=body.location, environment=body.environment)
    await d.insert()
    await audit(ctx.org_id, ctx.user.full_name, f"Added data center {d.name}")
    return success_response(svc.dc_public(d))


@router.patch("/datacenters/{dc_id}")
async def update_dc(dc_id: str, body: DataCenterPatch, ctx: OrgContext = Depends(require_org("infra:manage"))):
    d = await svc.get_dc(ctx.org_id, dc_id)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(d, k, v)
    await d.save()
    return success_response(svc.dc_public(d))


@router.delete("/datacenters/{dc_id}")
async def delete_dc(dc_id: str, ctx: OrgContext = Depends(require_org("infra:manage"))):
    await svc.delete_dc(ctx.org_id, dc_id)
    await audit(ctx.org_id, ctx.user.full_name, "Deleted a data center")
    return success_response(None)


# ---------- racks ----------

@router.post("/racks", status_code=201)
async def create_rack(body: RackIn, ctx: OrgContext = Depends(require_org("infra:manage"))):
    await svc.get_dc(ctx.org_id, body.dcId)
    if await Rack.find_one({"org_id": ctx.org_id, "dc_id": body.dcId, "label": body.label}):
        raise ApiException(409, "A rack with that label already exists in this data center.", "duplicate", {"label": "Already in use."})
    r = Rack(org_id=ctx.org_id, dc_id=body.dcId, label=body.label, row=body.row or body.label[:1].upper(), position=body.position,
             power_capacity_kw=body.powerCapacityKw)
    await r.insert()
    await audit(ctx.org_id, ctx.user.full_name, f"Added rack {r.label}")
    return success_response(svc.rack_public(r, []))


@router.patch("/racks/{rack_id}")
async def update_rack(rack_id: str, body: RackPatch, ctx: OrgContext = Depends(require_org("infra:manage"))):
    r = await svc.get_rack(ctx.org_id, rack_id)
    data = body.model_dump(exclude_none=True)
    if "label" in data and data["label"] != r.label and await Rack.find_one({"org_id": ctx.org_id, "dc_id": r.dc_id, "label": data["label"]}):
        raise ApiException(409, "A rack with that label already exists in this data center.", "duplicate", {"label": "Already in use."})
    if "powerCapacityKw" in data:
        r.power_capacity_kw = data.pop("powerCapacityKw")
    for k, v in data.items():
        setattr(r, k, v)
    await r.save()
    return success_response(svc.rack_public(r, []))


@router.delete("/racks/{rack_id}")
async def delete_rack(rack_id: str, ctx: OrgContext = Depends(require_org("infra:manage"))):
    await svc.delete_rack(ctx.org_id, rack_id)
    await audit(ctx.org_id, ctx.user.full_name, "Deleted a rack")
    return success_response(None)


# ---------- servers ----------

@router.get("/servers")
async def list_servers(ctx: OrgContext = Depends(require_org()), status: str | None = Query(default=None), rack_id: str | None = Query(default=None, alias="rackId")):
    servers = (await svc.inventory(ctx.org_id))["servers"]
    if status:
        servers = [s for s in servers if s["status"] == status]
    if rack_id:
        servers = [s for s in servers if s["rackId"] == rack_id]
    return success_response(servers)


@router.post("/servers", status_code=201, summary="Pre-register a server; its agent then reports with the same agentId")
async def create_server(body: ServerIn, ctx: OrgContext = Depends(require_org("infra:manage"))):
    if await Server.find_one({"org_id": ctx.org_id, "agent_id": body.agentId}):
        raise ApiException(409, "A server with that agent ID already exists.", "duplicate", {"agentId": "Already in use."})
    dc_id, rack_id = await svc.ensure_location(ctx.org_id, body.dcId, body.rackId)
    s = Server(org_id=ctx.org_id, agent_id=body.agentId, hostname=body.hostname, ip=body.ip, dc_id=dc_id, rack_id=rack_id, slot=body.slot,
               role=body.role, model=body.model, source="manual")
    await s.insert()
    await audit(ctx.org_id, ctx.user.full_name, f"Added server {s.hostname}")
    return success_response(svc.server_public(s))


@router.get("/servers/{server_id}")
async def get_server(server_id: str, ctx: OrgContext = Depends(require_org())):
    return success_response(svc.server_public(await svc.get_server(ctx.org_id, server_id)))


@router.patch("/servers/{server_id}")
async def update_server(server_id: str, body: ServerPatch, ctx: OrgContext = Depends(require_org("infra:manage"))):
    s = await svc.get_server(ctx.org_id, server_id)
    data = body.model_dump(exclude_unset=True)
    if "rackId" in data or "dcId" in data:
        s.dc_id, s.rack_id = await svc.ensure_location(ctx.org_id, data.pop("dcId", s.dc_id), data.pop("rackId", s.rack_id))
    for k, v in data.items():
        if v is not None:
            setattr(s, k, v)
    await s.save()
    return success_response(svc.server_public(s))


@router.delete("/servers/{server_id}", summary="Remove a server and its telemetry and predictions")
async def delete_server(server_id: str, ctx: OrgContext = Depends(require_org("infra:manage"))):
    await svc.delete_server(ctx.org_id, server_id)
    await audit(ctx.org_id, ctx.user.full_name, "Deleted a server")
    return success_response(None)


def _metrics_param(metrics: str) -> list[str]:
    wanted = [m.strip() for m in metrics.split(",") if m.strip()]
    bad = [m for m in wanted if m not in METRICS]
    if bad:
        raise ApiException(422, f"Unknown metric {bad[0]}. Use: {', '.join(METRICS)}.", "validation_error", {"metrics": "Unknown metric."})
    return wanted or list(METRICS)


@router.get("/servers/{server_id}/metrics", summary="5-minute averages for one server")
async def server_metrics(server_id: str, window: Window = "1h", metrics: str = "", ctx: OrgContext = Depends(require_org())):
    s = await svc.get_server(ctx.org_id, server_id)
    data = await svc.bucket_series(ctx.org_id, [s.id], window, _metrics_param(metrics))
    data["sample"] = s.demo
    return success_response(data)


@router.get("/metrics/fleet", summary="5-minute averages across all of the organization's servers")
async def fleet_metrics(window: Window = "24h", metrics: str = "", ctx: OrgContext = Depends(require_org())):
    return success_response(await svc.bucket_series(ctx.org_id, [], window, _metrics_param(metrics)))
