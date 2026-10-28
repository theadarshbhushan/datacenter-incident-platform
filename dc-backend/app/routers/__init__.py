from app.routers.auth import auth as auth_router, invitations as invitations_router, me as me_router, orgs as orgs_router
from app.routers.workspace import router as workspace_router, public as public_router
from app.routers.telemetry import router as telemetry_router
from app.routers.infrastructure import router as infrastructure_router
from app.routers.incidents import router as incidents_router
from app.routers.predictions import router as predictions_router
from app.routers.alerts import router as alerts_router
from app.routers.reports import router as reports_router
from app.routers.system import router as system_router

# Every router is organization-scoped (session + membership) except public, the auth flows and telemetry
# ingestion (organization API key).
app_routers = [
    auth_router, invitations_router, me_router, orgs_router, workspace_router, public_router, telemetry_router,
    infrastructure_router, incidents_router, predictions_router, alerts_router, reports_router, system_router,
]

__all__ = ["app_routers"]
