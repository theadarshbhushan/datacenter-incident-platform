from fastapi import APIRouter, Depends, HTTPException, status
from app.models.server import Server
from app.schemas.server import ServerCreate, ServerUpdate, ServerOut
from app.routers.auth import get_current_user
from app.models.user import User
from beanie import PydanticObjectId

router = APIRouter(prefix="/servers", tags=["Servers"])

def to_server_out(s: Server) -> ServerOut:
    return ServerOut(
        id=str(s.id),
        name=s.name,
        hostname=s.hostname,
        ip_address=s.ip_address,
        status=s.status,
        cpu_cores=s.cpu_cores,
        ram_gb=s.ram_gb,
        disk_gb=s.disk_gb,
        location=s.location,
        created_at=s.created_at
    )

@router.post("", response_model=ServerOut, status_code=status.HTTP_201_CREATED)
async def create_server(payload: ServerCreate, current_user: User = Depends(get_current_user)):
    existing = await Server.find_one(Server.hostname == payload.hostname)
    if existing:
        raise HTTPException(status_code=400, detail=f"Server with hostname '{payload.hostname}' already exists")
    
    server = Server(**payload.model_dump())
    await server.insert()
    return to_server_out(server)

@router.get("", response_model=list[ServerOut])
async def list_servers(status: str | None = None, current_user: User = Depends(get_current_user)):
    if status:
        servers = await Server.find(Server.status == status).to_list()
    else:
        servers = await Server.find_all().to_list()
    return [to_server_out(s) for s in servers]

@router.get("/{server_id}", response_model=ServerOut)
async def get_server(server_id: str, current_user: User = Depends(get_current_user)):
    # Also support fetching by hostname or standard ObjectID
    server = None
    if PydanticObjectId.is_valid(server_id):
        server = await Server.get(PydanticObjectId(server_id))
    if not server:
        # Fallback to hostname search
        server = await Server.find_one(Server.hostname == server_id)
    
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return to_server_out(server)

@router.put("/{server_id}", response_model=ServerOut)
async def update_server(server_id: str, payload: ServerUpdate, current_user: User = Depends(get_current_user)):
    server = None
    if PydanticObjectId.is_valid(server_id):
        server = await Server.get(PydanticObjectId(server_id))
    if not server:
        server = await Server.find_one(Server.hostname == server_id)
        
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(server, key, val)
    await server.save()
    return to_server_out(server)

@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(server_id: str, current_user: User = Depends(get_current_user)):
    server = None
    if PydanticObjectId.is_valid(server_id):
        server = await Server.get(PydanticObjectId(server_id))
    if not server:
        server = await Server.find_one(Server.hostname == server_id)
        
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    await server.delete()
    return None
