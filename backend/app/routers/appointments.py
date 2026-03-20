from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.exceptions import AppException
from app.core.logger import setup_logger
from app.db.database import get_db
from app.models.schemas import AppointmentCreateRequest, AppointmentStatusUpdateRequest
from app.services.push_service import dispatch_fcm_notification

logger = setup_logger()

router = APIRouter(prefix="/api/v1/appointments", tags=["Appointments"])


@router.post("/", status_code=201)
async def create_appointment(
    request: AppointmentCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Webhook entry point for booking a new appointment.

    Broadcast strategy:
      - Validates the doctor exists via a projection-only read (glenogi_fcm_token only).
      - Inserts the appointment document with status PENDING.
      - Concurrently resolves all Staff FCM tokens via a second projection-only cursor.
      - Combines the doctor token + all staff tokens, deduplicates, and filters nulls.
      - Enqueues one BackgroundTask per valid token so the 201 is returned immediately
        and FCM dispatch happens entirely after the response is sent.
    """
    try:
        doctor_oid = ObjectId(request.doctor_id)
    except InvalidId:
        raise AppException(
            detail="doctor_id is not a valid ObjectId.",
            code="INVALID_DOCTOR_ID",
            status_code=400,
        )

    # --- DB read 1: doctor existence check + FCM token (projection only) ---
    doctor = await db.doctor.find_one(
        {"_id": doctor_oid},
        {"glenogi_fcm_token": 1},
    )
    if not doctor:
        raise AppException(
            detail="Doctor not found.",
            code="DOCTOR_NOT_FOUND",
            status_code=404,
        )

    # --- DB write: insert appointment ---
    appointment_doc = {
        "patient_id": request.patient_id,
        "doctor_id": request.doctor_id,
        "status": "PENDING",
        "appointment_time": request.appointment_time,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.appointments.insert_one(appointment_doc)
    appointment_id = str(result.inserted_id)
    logger.info(f"Appointment created | id={appointment_id} | doctor={request.doctor_id}")

    # --- DB read 2: all staff FCM tokens (projection only) ---
    # Fetches ONLY the glenogi_fcm_token field across the entire staff collection.
    staff_cursor = db.staff.find({}, {"glenogi_fcm_token": 1})
    staff_tokens: list[str] = [
        doc["glenogi_fcm_token"]
        async for doc in staff_cursor
        if doc.get("glenogi_fcm_token")
    ]

    # --- Build deduplicated broadcast list ---
    # Use a set to prevent double-delivering if a staff member is also the doctor.
    raw_tokens: list[str | None] = [doctor.get("glenogi_fcm_token")] + staff_tokens
    broadcast_tokens: list[str] = list({t for t in raw_tokens if t})

    if broadcast_tokens:
        notification_data = {
            "appointment_id": appointment_id,
            "patient_id": request.patient_id,
            "status": "PENDING",
        }
        for token in broadcast_tokens:
            background_tasks.add_task(
                dispatch_fcm_notification,
                token=token,
                title="New Appointment Request",
                body=f"Patient {request.patient_id} has requested an appointment.",
                data_payload=notification_data,
            )
        logger.info(
            f"FCM broadcast queued | appointment={appointment_id} | recipients={len(broadcast_tokens)}"
        )
    else:
        logger.info(f"No FCM tokens found for appointment {appointment_id}; push skipped.")

    return {"status": "success", "appointment_id": appointment_id}


@router.patch("/{appointment_id}/status", status_code=200)
async def update_appointment_status(
    appointment_id: str,
    request: AppointmentStatusUpdateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Atomically transitions an appointment to a new status and notifies the
    assigned doctor via FCM if they have a registered device token.

    Uses find_one_and_update with ReturnDocument.AFTER to retrieve the
    updated document in a single atomic operation — no separate read required.
    The doctor's FCM token is then fetched via a projection-only query and
    FCM dispatch is enqueued as a BackgroundTask so the 200 is returned first.
    """
    try:
        appt_oid = ObjectId(appointment_id)
    except InvalidId:
        raise AppException(
            detail="appointment_id is not a valid ObjectId.",
            code="INVALID_APPOINTMENT_ID",
            status_code=400,
        )

    # --- Atomic update: returns the post-update document in one round trip ---
    updated_appointment = await db.appointments.find_one_and_update(
        {"_id": appt_oid},
        {"$set": {"status": request.status}},
        return_document=ReturnDocument.AFTER,
    )

    if updated_appointment is None:
        raise AppException(
            detail="Appointment not found.",
            code="APPOINTMENT_NOT_FOUND",
            status_code=404,
        )

    doctor_id = updated_appointment["doctor_id"]
    logger.info(
        f"Appointment {appointment_id} status updated to {request.status} | doctor={doctor_id}"
    )

    # --- DB read: doctor FCM token (projection only) ---
    try:
        doctor_oid = ObjectId(doctor_id)
    except InvalidId:
        logger.warning(f"Stored doctor_id '{doctor_id}' is not a valid ObjectId; FCM skipped.")
        return {"status": "success", "message": f"Appointment status updated to {request.status}."}

    doctor = await db.doctor.find_one(
        {"_id": doctor_oid},
        {"glenogi_fcm_token": 1},
    )

    if doctor and doctor.get("glenogi_fcm_token"):
        fcm_token = doctor["glenogi_fcm_token"]
        background_tasks.add_task(
            dispatch_fcm_notification,
            token=fcm_token,
            title="Appointment Status Update",
            body=f"Your appointment has been updated to {request.status}.",
            data_payload={
                "appointment_id": appointment_id,
                "doctor_id": doctor_id,
                "status": request.status,
            },
        )
        logger.info(f"FCM alert queued for doctor {doctor_id} | status={request.status}")
    else:
        logger.info(f"Doctor {doctor_id} has no FCM token; status alert skipped.")

    return {"status": "success", "message": f"Appointment status updated to {request.status}."}
