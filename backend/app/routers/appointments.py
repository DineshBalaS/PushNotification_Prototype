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

async def _resolve_device_tokens(
    db: AsyncIOMotorDatabase, *, owner_type: str, owner_id: str
) -> list[str]:
    doc = await db.device_tokens.find_one(
        {"owner_type": owner_type, "owner_id": owner_id}, {"fcm_tokens": 1}
    )
    tokens = doc.get("fcm_tokens", []) if doc else []
    return [t for t in tokens if isinstance(t, str) and t]


@router.post("/", status_code=201)
async def create_appointment(
    request: AppointmentCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Webhook entry point for booking a new appointment.

    Broadcast strategy:
      - Validates the doctor exists.
      - Inserts the appointment document with status PENDING.
      - Resolves the doctor's device tokens via device_tokens registry.
      - Resolves all Staff device tokens via device_tokens registry.
      - Combines doctor + staff tokens, deduplicates, and filters empties.
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

    # --- DB read 1: doctor existence check ---
    doctor = await db.doctor.find_one({"_id": doctor_oid}, {"_id": 1})
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

    # --- DB read 2: resolve doctor device tokens (device_tokens registry) ---
    doctor_tokens = await _resolve_device_tokens(
        db, owner_type="doctor", owner_id=str(doctor_oid)
    )

    # --- DB read 3: resolve all staff device tokens (device_tokens registry) ---
    staff_cursor = db.staff.find({}, {"_id": 1})
    staff_tokens: list[str] = []
    async for staff in staff_cursor:
        staff_id = staff.get("_id")
        if staff_id:
            staff_tokens.extend(
                await _resolve_device_tokens(db, owner_type="staff", owner_id=str(staff_id))
            )

    # --- Build deduplicated broadcast list ---
    # Use a set to prevent double-delivering if a staff member is also the doctor.
    broadcast_tokens: list[str] = list({t for t in (doctor_tokens + staff_tokens) if t})

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
    The doctor's device tokens are fetched via the device_tokens registry and
    FCM dispatch is enqueued as BackgroundTasks so the 200 is returned first.
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

    # --- DB read: doctor existence check ---
    try:
        doctor_oid = ObjectId(doctor_id)
    except InvalidId:
        logger.warning(f"Stored doctor_id '{doctor_id}' is not a valid ObjectId; FCM skipped.")
        return {"status": "success", "message": f"Appointment status updated to {request.status}."}

    doctor = await db.doctor.find_one({"_id": doctor_oid}, {"_id": 1})

    if doctor:
        doctor_tokens = await _resolve_device_tokens(
            db, owner_type="doctor", owner_id=str(doctor_oid)
        )
        if doctor_tokens:
            for token in doctor_tokens:
                background_tasks.add_task(
                    dispatch_fcm_notification,
                    token=token,
                    title="Appointment Status Update",
                    body=f"Your appointment has been updated to {request.status}.",
                    data_payload={
                        "appointment_id": appointment_id,
                        "doctor_id": doctor_id,
                        "status": request.status,
                    },
                )
            logger.info(
                f"FCM alert queued for doctor {doctor_id} | status={request.status} | recipients={len(doctor_tokens)}"
            )
        else:
            logger.info(f"Doctor {doctor_id} has no device_tokens; status alert skipped.")
    else:
        logger.info(f"Doctor {doctor_id} not found; status alert skipped.")

    return {"status": "success", "message": f"Appointment status updated to {request.status}."}
