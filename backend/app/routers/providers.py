from uuid import uuid4

from fastapi import APIRouter, Depends, status
from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.db.database import get_db
from app.core.auth import get_current_provider
from app.core.config import settings
from app.models.domain import Doctor, Staff
from app.models.schemas import (
    FcmTokenUpdateRequest,
    ProviderSignupRequest,
    ProviderSignupResponse,
)
from app.core.exceptions import AppException
from app.core.logger import setup_logger
from app.services.novu_subscribers import sync_subscriber_fcm_to_novu

logger = setup_logger()

router = APIRouter(prefix="/api/v1/providers", tags=["Providers"])


@router.post(
    "/signup",
    status_code=status.HTTP_201_CREATED,
    response_model=ProviderSignupResponse,
)
async def signup_provider(
    body: ProviderSignupRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Prototype signup: inserts one ``doctor`` or ``staff`` with a new ``user_id`` (UUID).
    Novu / FCM are not touched here; the client calls PATCH /me/fcm-token after onboarding.
    """
    logger.debug(
        "Signup: start owner_type=%s first_name_len=%s last_name_len=%s doctor_specialty_provided=%s",
        body.owner_type,
        len(body.first_name),
        len(body.last_name),
        body.specialty is not None,
    )

    user_id = str(uuid4())
    full_name = f"{body.first_name} {body.last_name}".strip()

    if body.owner_type == "doctor":
        specialty = body.specialty if body.specialty is not None else "General"
        doc = Doctor(user_id=user_id, name=full_name, specialty=specialty)
        payload = doc.model_dump(by_alias=True, exclude_none=True)
        collection = db.doctor
        logger.debug(
            "Signup: inserting doctor name=%s specialty=%s user_id=%s",
            full_name,
            specialty,
            user_id,
        )
    else:
        doc = Staff(user_id=user_id, name=full_name, role="receptionist")
        payload = doc.model_dump(by_alias=True, exclude_none=True)
        collection = db.staff
        logger.debug(
            "Signup: inserting staff name=%s role=%s user_id=%s",
            full_name,
            payload.get("role"),
            user_id,
        )

    try:
        result = await collection.insert_one(payload)
    except DuplicateKeyError:
        logger.warning(
            "Signup: duplicate key on insert | owner_type=%s user_id=%s",
            body.owner_type,
            user_id,
        )
        raise AppException(
            detail="Signup could not complete due to a conflicting record.",
            code="SIGNUP_DUPLICATE_KEY",
            status_code=status.HTTP_409_CONFLICT,
        ) from None
    except PyMongoError:
        logger.error(
            "Signup: database error | owner_type=%s user_id=%s",
            body.owner_type,
            user_id,
            exc_info=True,
        )
        raise AppException(
            detail="Signup could not be saved. Please try again.",
            code="SIGNUP_DB_ERROR",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        ) from None

    owner_id = str(result.inserted_id)

    logger.debug(
        "Signup: inserted owner_type=%s owner_id=%s user_id=%s",
        body.owner_type,
        owner_id,
        user_id,
    )
    logger.info(
        "Provider signup completed | owner_type=%s owner_id=%s user_id=%s",
        body.owner_type,
        owner_id,
        user_id,
    )

    return ProviderSignupResponse(
        owner_id=owner_id,
        user_id=user_id,
        owner_type=body.owner_type,
    )


@router.patch("/me/fcm-token", status_code=200)
async def update_provider_fcm_token(
    request: FcmTokenUpdateRequest,
    provider: dict = Depends(get_current_provider),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Registers or rotates the FCM device token for the authenticated provider.
    Tokens are stored in Novu (subscriberId = Mongo ``user_id``). Optional
    legacy write to ``device_tokens`` when ``PERSIST_DEVICE_TOKENS_IN_MONGO=true``.
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
    exists = await db[collection_name].find_one(
        {"_id": object_id},
        {"_id": 1, "user_id": 1, "name": 1},
    )
    if not exists:
        raise AppException(
            detail="Provider document not found.",
            code="PROVIDER_NOT_FOUND",
            status_code=404,
        )

    subscriber_user_id = exists.get("user_id")
    if not subscriber_user_id or not isinstance(subscriber_user_id, str):
        logger.warning(
            "Provider %s/%s missing valid user_id — re-seed DB or migrate documents",
            owner_type,
            object_id,
        )
        raise AppException(
            detail="Provider record has no user_id; run database seed or add user_id to this document.",
            code="PROVIDER_USER_ID_MISSING",
            status_code=409,
        )

    display_name = exists.get("name")
    if isinstance(display_name, str):
        display_name = display_name.strip() or None
    else:
        display_name = None

    logger.debug(
        "FCM PATCH | owner_type=%s owner_object_id=%s user_id=%s has_display_name=%s novu_next=1",
        owner_type,
        object_id,
        subscriber_user_id,
        bool(display_name),
    )

    await sync_subscriber_fcm_to_novu(
        user_id=subscriber_user_id,
        fcm_token=request.fcm_token,
        display_name=display_name,
    )

    if settings.persist_device_tokens_in_mongo:
        logger.debug(
            "FCM PATCH | legacy device_tokens write enabled owner_type=%s owner_id=%s",
            owner_type,
            object_id,
        )
        await db.device_tokens.update_one(
            {"owner_type": owner_type, "owner_id": str(object_id)},
            {
                "$setOnInsert": {"owner_type": owner_type, "owner_id": str(object_id)},
                "$addToSet": {"fcm_tokens": request.fcm_token},
            },
            upsert=True,
        )

    logger.info(
        "FCM token registered (Novu) | owner_type=%s owner_id=%s user_id=%s token_prefix=%s... legacy_mongo=%s",
        owner_type,
        object_id,
        subscriber_user_id,
        request.fcm_token[:20],
        settings.persist_device_tokens_in_mongo,
    )
    return {
        "status": "success",
        "message": "FCM token registered with notification provider.",
        "owner_type": owner_type,
        "owner_id": str(object_id),
        "user_id": subscriber_user_id,
    }
