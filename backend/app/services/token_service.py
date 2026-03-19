from app.db.database import get_db
from app.core.logger import setup_logger
from app.core.exceptions import AppException
from app.models.schemas import TokenRegistrationRequest

logger = setup_logger()

async def register_device_token(request: TokenRegistrationRequest) -> dict:
    db = get_db()
    try:
        # Upsert logic: find by owner_id, if exists add token, if not create new
        result = await db.device_tokens.update_one(
            {"owner_id": request.owner_id},
            {
                "$set": {"owner_type": request.owner_type},
                "$addToSet": {"fcm_tokens": request.fcm_token}
            },
            upsert=True
        )
        logger.info(f"[SUCCESS] Device token registered securely for owner_id: {request.owner_id}")
        return {"status": "success", "message": "Token registered successfully"}
    except Exception as e:
        logger.error(f"[ERROR] Failed to register device token for owner_id: {request.owner_id}. Error: {e}", exc_info=True)
        raise AppException(
            detail="Failed to register device token natively.",
            code="TOKEN_REGISTRATION_FAILED",
            status_code=500
        )
