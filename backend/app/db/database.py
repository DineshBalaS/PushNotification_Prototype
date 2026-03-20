import pymongo
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import settings
from app.core.logger import setup_logger
from app.core.exceptions import AppException

logger = setup_logger()


class Database:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None


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
            status_code=500,
        )


async def _create_indexes():
    """Indexes aligned to the 4-collection schema."""
    logger.info("Setting up database indexes...")
    try:
        # Appointments: fast lookup by doctor for FCM projection, and by status for filtering
        await db_config.db.appointments.create_index(
            [("doctor_id", pymongo.ASCENDING)]
        )
        await db_config.db.appointments.create_index(
            [("status", pymongo.ASCENDING)]
        )
        # Appointments: chronological listing per patient
        await db_config.db.appointments.create_index(
            [("patient_id", pymongo.ASCENDING), ("appointment_time", pymongo.DESCENDING)]
        )
        logger.info("Database indexes established.")
    except Exception as e:
        logger.error(f"Failed to create MongoDB indexes: {e}")


async def close_mongo_connection():
    logger.info("Closing MongoDB connection...")
    if db_config.client:
        db_config.client.close()
        logger.info("MongoDB connection closed.")


def get_db() -> AsyncIOMotorDatabase:
    """
    FastAPI dependency that returns the active Motor database instance.
    Usage: db: AsyncIOMotorDatabase = Depends(get_db)
    """
    if db_config.db is None:
        raise RuntimeError("Database is not initialized")
    return db_config.db
