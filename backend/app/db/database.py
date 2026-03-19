import pymongo
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.logger import setup_logger
from app.core.exceptions import AppException

logger = setup_logger()

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_config = Database()

async def connect_to_mongo():
    logger.info("Initializing connection to MongoDB...")
    try:
        db_config.client = AsyncIOMotorClient(settings.mongodb_url)
        db_config.db = db_config.client[settings.mongodb_db_name]
        logger.info(f"Connected to database: {settings.mongodb_db_name}")
        
        await _create_indexes()
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise AppException(
            detail="Database connection failure",
            code="DB_CONNECTION_ERROR",
            status_code=500
        )

async def _create_indexes():
    """Create collections and compound indexes for optimization."""
    logger.info("Setting up database automated indexing...")
    try:
        # Index on user_id and timestamp for efficient Notification Inbox fetching
        await db_config.db.notification_inbox.create_index(
            [("user_id", pymongo.ASCENDING), ("timestamp", pymongo.DESCENDING)]
        )
        
        # Index on owner_id for Device Tokens
        await db_config.db.device_tokens.create_index(
            [("owner_id", pymongo.ASCENDING)]
        )

        logger.info("Database structured indexes effectively established.")
    except Exception as e:
        logger.error(f"Failed to create MongoDB indexes: {e}")

async def close_mongo_connection():
    logger.info("Closing robust MongoDB connection...")
    if db_config.client:
        db_config.client.close()
        logger.info("MongoDB connection closed safely.")

def get_db():
    if db_config.db is None:
        raise RuntimeError("Database instance is not fully initialized")
    return db_config.db
