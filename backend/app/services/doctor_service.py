from app.db.database import get_db
from app.core.logger import setup_logger
from app.core.exceptions import AppException
import pymongo

logger = setup_logger()

async def fetch_doctors(limit: int = 20, skip: int = 0) -> list:
    db = get_db()
    try:
        logger.info(f"Fetching doctor roster natively | limit: {limit} | skip: {skip}")
        
        # Pulling purely from db.doctor mapping as defined securely by the seed
        cursor = db.doctor.find({}).sort("created_at", pymongo.DESCENDING).skip(skip).limit(limit)
        
        doctors = []
        async for doc in cursor:
            # Map object ID safely for pure REST representation
            doc["_id"] = str(doc["_id"])
            doctors.append(doc)
            
        logger.info(f"[SUCCESS] Retrieved {len(doctors)} doctor entities dynamically.")
        return doctors
        
    except Exception as e:
        logger.error(f"[ERROR] Intense extraction workflow failed on doctors: {e}", exc_info=True)
        raise AppException(
            detail="Failed to retrieve functional doctor dataset locally.",
            code="DOCTOR_FETCH_FAILED",
            status_code=500
        )
