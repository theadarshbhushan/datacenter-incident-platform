"""
Versioned, idempotent data migrations for MongoDB.

Indexes are declared on the Beanie models and created when the API (or this runner) initializes
Beanie. Migrations handle everything else: moving data between collections and backfilling fields.
Applied migrations are recorded in the `schema_migrations` collection, so each runs once.

    python -m app.migrations status
    python -m app.migrations upgrade

The API also applies pending migrations at startup unless RUN_MIGRATIONS_ON_STARTUP=false.
"""
from __future__ import annotations

from typing import Awaitable, Callable, List, Tuple

from loguru import logger

from app.migrations import m0002_incident_fields, m0003_split_workspace
from app.models.monitoring import SchemaMigration

Migration = Tuple[str, str, Callable[[object], Awaitable[None]]]

MIGRATIONS: List[Migration] = [
    ("0001_baseline", "Collections and indexes declared on the models (created by Beanie).", None),
    ("0002_incident_fields", "Mirror incident and alert fields to top-level, indexed fields; flag sample rows.", m0002_incident_fields.run),
    ("0003_split_workspace", "Move data centers, racks, servers, telemetry and alert rules out of org_workspaces into their own collections.", m0003_split_workspace.run),
]


async def pending() -> List[Migration]:
    done = {m.id for m in await SchemaMigration.find_all().to_list()}
    return [m for m in MIGRATIONS if m[0] not in done]


async def upgrade(db) -> List[str]:
    applied = []
    for name, description, fn in await pending():
        logger.info(f"Applying migration {name}: {description}")
        if fn:
            await fn(db)
        await SchemaMigration(id=name).insert()
        applied.append(name)
    return applied


async def status() -> List[dict]:
    done = {m.id: m.applied_at for m in await SchemaMigration.find_all().to_list()}
    return [{"name": n, "description": d, "appliedAt": done.get(n)} for n, d, _ in MIGRATIONS]
