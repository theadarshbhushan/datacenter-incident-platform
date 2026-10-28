"""Backfill top-level incident/alert fields from `data`, and flag rows of sample workspaces as demo."""
from app.models.account import WorkspaceAlert, WorkspaceIncident


async def run(db) -> None:
    sample_orgs = {d["_id"] async for d in db["org_workspaces"].find({"sample": True}, {"_id": 1})}
    async for doc in WorkspaceIncident.find_all():
        doc.sync()
        if doc.org_id in sample_orgs:
            doc.demo = True
            doc.data = {**doc.data, "sample": True}
        await doc.save()
    async for doc in WorkspaceAlert.find_all():
        doc.sync()
        doc.demo = doc.demo or doc.org_id in sample_orgs
        await doc.save()
