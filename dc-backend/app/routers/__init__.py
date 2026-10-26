from app.routers.auth import auth as auth_router, invitations as invitations_router, me as me_router, orgs as orgs_router
from app.routers.workspace import router as workspace_router, public as public_router
from app.routers.ingest import router as ingest_router

# Internal telemetry API (pipeline-wide data, not organization-scoped): service-to-service only.
from app.routers.servers import router as servers_router
from app.routers.metrics import router as metrics_router
from app.routers.incidents import router as incidents_router
from app.routers.predictions import router as predictions_router
from app.routers.analytics import router as analytics_router
from app.routers.alerts import router as alerts_router

app_routers = [auth_router, invitations_router, me_router, orgs_router, workspace_router, public_router, ingest_router]
internal_routers = [servers_router, metrics_router, incidents_router, predictions_router, analytics_router, alerts_router]

__all__ = ["app_routers", "internal_routers"]
