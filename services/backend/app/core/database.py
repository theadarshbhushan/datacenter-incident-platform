from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import get_settings
from loguru import logger

async def init_db():
    settings = get_settings()
    logger.info("Initializing database connection to MongoDB...")
    
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    
    # Import models locally to avoid circular dependencies
    from app.models.user import User
    from app.models.server import Server
    from app.models.metric import Metric
    from app.models.incident import Incident
    
    await init_beanie(
        database=db,
        document_models=[
            User,
            Server,
            Metric,
            Incident,
        ]
    )
    logger.info("Database connection and Beanie models initialized successfully.")
