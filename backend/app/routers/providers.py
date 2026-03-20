from fastapi import APIRouter, Depends
from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.database import get_db
from app.core.auth import get_current_provider
from app.models.schemas import FcmTokenUpdateRequest
from app.core.exceptions import AppException
from app.core.logger import setup_logger

logger = setup_logger()

router = APIRouter(prefix="/api/v1/providers", tags=["Providers"])


@router.patch("/me/fcm-token", status_code=200)
async def update_provider_fcm_token(
    request: FcmTokenUpdateRequest,
    provider: dict = Depends(get_current_provider),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Registers or rotates the FCM device token for the currently authenticated
    provider (Doctor or Staff).  The auth stub returns a mock provider; swap
    get_current_provider() for real JWT decoding before production.
    """
    provider_id = provider["id"]
    collection_name = provider["collection"]

    try:
        object_id = ObjectId(provider_id)
    except InvalidId:
        raise AppException(
            detail=f"Provider id '{provider_id}' is not a valid ObjectId.",
            code="INVALID_PROVIDER_ID",
            status_code=400,
        )

    result = await db[collection_name].update_one(
        {"_id": object_id},
        {"$set": {"glenogi_fcm_token": request.fcm_token}},
    )

    if result.matched_count == 0:
        raise AppException(
            detail="Provider document not found.",
            code="PROVIDER_NOT_FOUND",
            status_code=404,
        )

    logger.info(f"FCM token updated for provider {provider_id} in collection '{collection_name}'.")
    return {"status": "success", "message": "FCM token updated."}
