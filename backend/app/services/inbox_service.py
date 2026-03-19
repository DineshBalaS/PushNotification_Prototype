from app.db.database import get_db
from app.core.logger import setup_logger
from app.core.exceptions import AppException
from typing import List
import pymongo

logger = setup_logger()

async def get_user_notifications(user_id: str, limit: int = 20, skip: int = 0) -> List[dict]:
    db = get_db()
    try:
        logger.info(f"Fetching localized notifications for user_id: {user_id} | limit: {limit} | skip: {skip}")
        
        # Enforce memory constraints and fetch specifically
        cursor = db.notification_inbox.find(
            {"user_id": user_id}
        ).sort("timestamp", pymongo.DESCENDING).skip(skip).limit(limit)
        
        notifications = []
        async for document in cursor:
            # Stringify the ObjectId for pure JSON encoding in the Fastapi Router
            document["_id"] = str(document["_id"])
            notifications.append(document)
            
        logger.info(f"[SUCCESS] Retrieved {len(notifications)} records for user: {user_id}")
        return notifications
        
    except Exception as e:
        logger.error(f"[ERROR] Failed to natively fetch notifications for {user_id}: {e}", exc_info=True)
        raise AppException(
            detail="Failed to fetch localized user notifications.",
            code="NOTIFICATION_FETCH_FAILED",
            status_code=500
        )
