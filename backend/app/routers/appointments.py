from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.logger import setup_logger
from app.db.database import get_db
from app.models.schemas import (
    AppointmentCreatedResponse,
    AppointmentCreateRequest,
    AppointmentStatusUpdateRequest,
)
from app.services.novu_triggers import trigger_novu_workflow

logger = setup_logger()

router = APIRouter(prefix="/api/v1/appointments", tags=["Appointments"])


@router.post("/", status_code=201, response_model=AppointmentCreatedResponse)
async def create_appointment(
    request: AppointmentCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Webhook entry point for booking a new appointment.

    After insert, enqueues a single BackgroundTask that triggers the Novu workflow
    (``NOVU_APPOINTMENT_WORKFLOW_ID``) for the doctor and all staff ``user_id``\ s
    (Novu subscriberIds). Failures are logged only; HTTP 201 is unchanged.
    """
    try:
        doctor_oid = ObjectId(request.doctor_id)
    except InvalidId:
        raise AppException(
            detail="doctor_id is not a valid ObjectId.",
            code="INVALID_DOCTOR_ID",
            status_code=400,
        )

    # --- DB read 1: doctor existence + stable user_id (Novu subscriberId) + display name ---
    doctor = await db.doctor.find_one(
        {"_id": doctor_oid}, {"_id": 1, "user_id": 1, "name": 1}
    )
    if not doctor:
        raise AppException(
            detail="Doctor not found.",
            code="DOCTOR_NOT_FOUND",
            status_code=404,
        )

    raw_uid = doctor.get("user_id")
    doctor_user_id: str | None = None
    if isinstance(raw_uid, str):
        stripped = raw_uid.strip()
        if stripped:
            doctor_user_id = stripped
        else:
            logger.warning(
                "Doctor %s has empty user_id; appointment stored with doctor_user_id=null",
                doctor_oid,
            )
    else:
        logger.warning(
            "Doctor %s missing user_id field; appointment stored with doctor_user_id=null (Novu triggers may need it)",
            doctor_oid,
        )

    logger.debug(
        "Appointment create | doctor_oid=%s resolved doctor_user_id=%s",
        doctor_oid,
        doctor_user_id or "(null)",
    )

    # --- DB write: insert appointment ---
    appointment_doc = {
        "patient_id": request.patient_id,
        "doctor_id": request.doctor_id,
        "doctor_user_id": doctor_user_id,
        "status": "PENDING",
        "appointment_time": request.appointment_time,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.appointments.insert_one(appointment_doc)
    appointment_id = str(result.inserted_id)
    logger.info(
        "Appointment created | id=%s | doctor=%s | doctor_user_id=%s",
        appointment_id,
        request.doctor_id,
        doctor_user_id or "(null)",
    )

    # --- Novu recipients: doctor + staff user_id (subscriberId), deduped ---
    subscriber_recipients: list[str] = []
    seen_subscribers: set[str] = set()
    if doctor_user_id:
        seen_subscribers.add(doctor_user_id)
        subscriber_recipients.append(doctor_user_id)
    else:
        logger.warning(
            "Novu trigger skipped for doctor — no user_id | appointment_id=%s",
            appointment_id,
        )

    async for staff_row in db.staff.find({}, {"user_id": 1}):
        raw_suid = staff_row.get("user_id")
        if isinstance(raw_suid, str):
            suid = raw_suid.strip()
            if suid and suid not in seen_subscribers:
                seen_subscribers.add(suid)
                subscriber_recipients.append(suid)

    # --- Patient display name for workflow payload (dashboard template variables) ---
    patient_name = "Unknown"
    try:
        patient_oid = ObjectId(request.patient_id)
    except InvalidId:
        logger.warning(
            "patient_id is not a valid ObjectId; using fallback patientName | appointment_id=%s",
            appointment_id,
        )
    else:
        patient_doc = await db.patient.find_one({"_id": patient_oid}, {"name": 1})
        raw_name = patient_doc.get("name") if patient_doc else None
        if isinstance(raw_name, str) and raw_name.strip():
            patient_name = raw_name.strip()

    novu_payload: dict = {
        "patientName": patient_name,
        "appointmentTime": request.appointment_time.isoformat(),
        "appointmentId": appointment_id,
    }
    raw_doctor_name = doctor.get("name") if doctor else None
    if isinstance(raw_doctor_name, str) and raw_doctor_name.strip():
        novu_payload["doctorName"] = raw_doctor_name.strip()

    if subscriber_recipients:
        background_tasks.add_task(
            trigger_novu_workflow,
            workflow_id=settings.novu_appointment_workflow_id,
            subscriber_ids=subscriber_recipients,
            payload=novu_payload,
            transaction_id=appointment_id,
        )
        logger.info(
            "Novu appointment workflow queued | appointment_id=%s | recipients=%s",
            appointment_id,
            len(subscriber_recipients),
        )
    else:
        logger.info(
            "Novu appointment workflow skipped | appointment_id=%s | reason=no_subscriber_recipients",
            appointment_id,
        )

    return AppointmentCreatedResponse(
        status="success",
        appointment_id=appointment_id,
        doctor_user_id=doctor_user_id,
    )


@router.patch("/{appointment_id}/status", status_code=200)
async def update_appointment_status(
    appointment_id: str,
    request: AppointmentStatusUpdateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Atomically updates appointment status and notifies the assigned doctor via Novu
    (``NOVU_APPOINTMENT_STATUS_WORKFLOW_ID``) when ``doctor_user_id`` is stored on
    the appointment. Failures are logged only; HTTP 200 is unchanged.
    """
    try:
        appt_oid = ObjectId(appointment_id)
    except InvalidId:
        raise AppException(
            detail="appointment_id is not a valid ObjectId.",
            code="INVALID_APPOINTMENT_ID",
            status_code=400,
        )

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
        "Appointment %s status updated to %s | doctor=%s",
        appointment_id,
        request.status,
        doctor_id,
    )

    doc_novu_id = updated_appointment.get("doctor_user_id")
    subscriber_id: str | None = None
    if isinstance(doc_novu_id, str) and doc_novu_id.strip():
        subscriber_id = doc_novu_id.strip()
    else:
        logger.warning(
            "Novu status workflow skipped — no doctor_user_id on appointment | appointment_id=%s",
            appointment_id,
        )

    if subscriber_id:
        patient_name = "Unknown"
        raw_pid = updated_appointment.get("patient_id")
        if isinstance(raw_pid, str):
            try:
                patient_oid = ObjectId(raw_pid)
            except InvalidId:
                logger.debug(
                    "Status notify: patient_id not ObjectId; using fallback name | appointment_id=%s",
                    appointment_id,
                )
            else:
                patient_doc = await db.patient.find_one({"_id": patient_oid}, {"name": 1})
                raw_name = patient_doc.get("name") if patient_doc else None
                if isinstance(raw_name, str) and raw_name.strip():
                    patient_name = raw_name.strip()

        status_payload: dict = {
            "appointmentId": appointment_id,
            "status": request.status,
            "patientName": patient_name,
            "doctorId": doctor_id,
        }

        tx_id = f"{appointment_id}:status:{request.status}"
        background_tasks.add_task(
            trigger_novu_workflow,
            workflow_id=settings.novu_appointment_status_workflow_id,
            subscriber_ids=[subscriber_id],
            payload=status_payload,
            transaction_id=tx_id,
        )
        logger.info(
            "Novu status workflow queued | appointment_id=%s | status=%s | subscriber=%s",
            appointment_id,
            request.status,
            subscriber_id[:8] + "…",
        )

    return {"status": "success", "message": f"Appointment status updated to {request.status}."}
