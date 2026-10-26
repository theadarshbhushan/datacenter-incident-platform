from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from loguru import logger

from app.core.config import settings
from app.models.user import User
from app.models.server import Server
from app.models.metric import Metric
from app.models.incident import Incident
from app.models.alert import Alert
from app.models.account import ACCOUNT_MODELS

client: AsyncIOMotorClient = None


async def init_db():
    global client
    logger.info(f"Connecting to MongoDB [DB: {settings.MONGO_DB_NAME}]...")  # URI omitted: it contains credentials
    client = AsyncIOMotorClient(settings.MONGO_URI)
    database = client[settings.MONGO_DB_NAME]
    await init_beanie(
        database=database,
        document_models=[
            User,
            Server,
            Metric,
            Incident,
            Alert,
            *ACCOUNT_MODELS,
        ],
        allow_index_dropping=False,
    )
    logger.info("Beanie initialized with all models")


async def close_db():
    global client
    if client:
        client.close()
        logger.info("MongoDB client closed.")


def get_database():
    global client
    if client is None:
        raise RuntimeError("Database not initialized")
    return client[settings.MONGO_DB_NAME]
