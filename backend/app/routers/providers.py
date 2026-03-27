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
    # Prototype mode: allow explicit impersonation from client payload to
    # avoid ambiguity when no real authentication exists yet.
    if request.owner_type and request.owner_id:
        owner_type = request.owner_type
        owner_id = request.owner_id
    else:
        owner_type = provider.get("type") or provider.get("collection")
        owner_id = provider.get("id")

    try:
        object_id = ObjectId(owner_id)
    except InvalidId:
        raise AppException(
            detail=f"Provider id '{owner_id}' is not a valid ObjectId.",
            code="INVALID_PROVIDER_ID",
            status_code=400,
        )

    # Validate owner exists in the expected collection.
    # Collection names in this repo are singular: "doctor" and "staff".
    collection_name = "doctor" if owner_type == "doctor" else "staff"
    exists = await db[collection_name].find_one({"_id": object_id}, {"_id": 1})
    if not exists:
        raise AppException(
            detail="Provider document not found.",
            code="PROVIDER_NOT_FOUND",
            status_code=404,
        )

    # Upsert into decoupled device_tokens registry.
    await db.device_tokens.update_one(
        {"owner_type": owner_type, "owner_id": str(object_id)},
        {
            "$setOnInsert": {"owner_type": owner_type, "owner_id": str(object_id)},
            "$addToSet": {"fcm_tokens": request.fcm_token},
        },
        upsert=True,
    )

    logger.info(
        f"Device token registered | owner_type={owner_type} | owner_id={str(object_id)} | token={request.fcm_token[:20]}..."
    )
    return {"status": "success", "message": "FCM token registered.", "owner_type": owner_type, "owner_id": str(object_id)}
