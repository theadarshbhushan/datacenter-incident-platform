from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from loguru import logger

from app.core.config import settings
from app.models.user import User
from app.models.server import Server
from app.models.metric import Metric
from app.models.incident import Incident
from app.models.alert import Alert

client: AsyncIOMotorClient = None


async def init_db():
    global client
    mongo_uri = settings.get_mongo_uri
    logger.info(f"Connecting to MongoDB at {mongo_uri} [DB: {settings.MONGO_DB_NAME}]...")
    client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=5000)
    database = client[settings.MONGO_DB_NAME]

    try:
        await init_beanie(
            database=database,
            document_models=[
                User,
                Server,
                Metric,
                Incident,
                Alert,
            ],
        )
    except Exception as e:
        if "Authentication failed" in str(e) and ("@localhost:" in mongo_uri or "@127.0.0.1:" in mongo_uri):
            fallback_uri = f"mongodb://localhost:27017/{settings.MONGO_DB_NAME}"
            logger.warning(f"Auth failed on local MongoDB. Connecting with fallback URI: {fallback_uri}")
            client = AsyncIOMotorClient(fallback_uri, serverSelectionTimeoutMS=5000)
            database = client[settings.MONGO_DB_NAME]
            await init_beanie(
                database=database,
                document_models=[
                    User,
                    Server,
                    Metric,
                    Incident,
                    Alert,
                ],
            )
        else:
            raise e
    logger.info("Beanie ODM initialized successfully with all document models.")


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
