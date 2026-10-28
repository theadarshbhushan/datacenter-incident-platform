from beanie import init_beanie
from loguru import logger
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models import ALL_MODELS

client: AsyncIOMotorClient = None


async def init_db(run_migrations: bool | None = None):
    """Connect, create collections and indexes, then apply pending data migrations (see app.migrations)."""
    global client
    logger.info(f"Connecting to MongoDB [DB: {settings.MONGO_DB_NAME}]...")  # URI omitted: it contains credentials
    client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=10000, tz_aware=False)
    database = client[settings.MONGO_DB_NAME]
    await init_beanie(database=database, document_models=ALL_MODELS, allow_index_dropping=False)
    logger.info("Beanie initialized with all models")
    if run_migrations if run_migrations is not None else settings.RUN_MIGRATIONS_ON_STARTUP:
        from app import migrations

        applied = await migrations.upgrade(database)
        if applied:
            logger.info(f"Applied migrations: {', '.join(applied)}")


async def close_db():
    global client
    if client:
        client.close()
        logger.info("MongoDB client closed.")


async def ping() -> bool:
    try:
        await get_database().command("ping")
        return True
    except Exception:
        return False


def get_database():
    global client
    if client is None:
        raise RuntimeError("Database not initialized")
    return client[settings.MONGO_DB_NAME]
