import asyncio
import pymongo
from bson import ObjectId
from app.db.database import get_db
from app.core.logger import setup_logger
from app.core.exceptions import AppException
from app.models.schemas import AppointmentCreateRequest
from app.services.notification_service import send_mock_patient_sms, dispatch_internal_push

logger = setup_logger()

async def _notify_appointment_stakeholders(doctor_id: str, title: str, body: str):
    """Internal decoupled background proxy orchestrating Web Inbox and Mobile Firebase broadcasts natively."""
    db = get_db()
    try:
        # 1. Target Owners Natively (Doctor + All Staff) utilizing pure BSON projection
        unique_owners = {doctor_id}
        staff_cursor = db.staff.find({}, {"_id": 1})
        async for staff in staff_cursor:
            unique_owners.add(str(staff["_id"]))
            
        # 2. Universal Inbox Insertion regardless of FCM token presence
        notifications_to_insert = []
        from datetime import datetime, timezone
        for owner in unique_owners:
            notifications_to_insert.append({
                "user_id": owner,
                "title": title,
                "body": body,
                "is_read": False,
                "timestamp": datetime.now(timezone.utc)
            })
            
        if notifications_to_insert:
            await db.notification_inbox.insert_many(notifications_to_insert)
            logger.info(f"Unconditionally inserted {len(notifications_to_insert)} universal NotificationInbox records.")
            
        # 3. Resolve Native Push Tokens only mapping against targeted users
        device_cursor = db.device_tokens.find({"owner_id": {"$in": list(unique_owners)}})
        unique_fcm_tokens = set()
        
        async for device in device_cursor:
            for token in device.get("fcm_tokens", []):
                unique_fcm_tokens.add(token)
                
        # 4. Spawns Push Logic Non-blocking
        if unique_fcm_tokens:
            await dispatch_internal_push(list(unique_fcm_tokens), title, body)
            
    except Exception as e:
        logger.error(f"[ERROR] Background notification dispatcher failed structurally: {e}", exc_info=True)

async def create_appointment(request: AppointmentCreateRequest) -> dict:
    db = get_db()
    try:
        # Validate patient and doctor exist robustly using ObjectId Lookups
        patient = await db.patient.find_one({"_id": ObjectId(request.patient_id)})
        if not patient:
            raise AppException(detail="Patient not found.", code="PATIENT_NOT_FOUND", status_code=404)
            
        doctor = await db.doctor.find_one({"_id": ObjectId(request.doctor_id)})
        if not doctor:
            raise AppException(detail="Doctor not found.", code="DOCTOR_NOT_FOUND", status_code=404)
            
        appointment_doc = {
            "patient_id": request.patient_id,
            "doctor_id": request.doctor_id,
            "status": "pending",
            "appointment_time": request.appointment_time
        }
        
        result = await db.appointments.insert_one(appointment_doc)
        logger.info(f"[SUCCESS] Appointment created rigorously with ID: {result.inserted_id} (pending)")
        
        # Dispatch Notification Lifecycle Natively 
        title = "New Appointment Requested"
        body = f"A new pending appointment has been requested by patient {request.patient_id}."
        asyncio.create_task(_notify_appointment_stakeholders(request.doctor_id, title, body))
        
        return {
            "status": "success",
            "appointment_id": str(result.inserted_id),
            "message": "Appointment requested."
        }
    except AppException:
        raise
    except Exception as e:
        logger.error(f"[ERROR] Failed to securely create appointment. Error: {e}", exc_info=True)
        raise AppException(
            detail="Failed to create pending appointment.",
            code="APPOINTMENT_CREATION_FAILED",
            status_code=500
        )

async def approve_appointment(appointment_id: str) -> dict:
    db = get_db()
    try:
        # 1. Fetch and Validate State
        appointment = await db.appointments.find_one({"_id": ObjectId(appointment_id)})
        if not appointment:
            raise AppException(detail="Appointment not found.", code="APPOINTMENT_NOT_FOUND", status_code=404)
        
        if appointment.get("status") == "approved":
            raise AppException(detail="Appointment completely approved already.", code="APPOINTMENT_ALREADY_APPROVED", status_code=400)
            
        # 2. Update Status Natively
        await db.appointments.update_one(
            {"_id": ObjectId(appointment_id)},
            {"$set": {"status": "approved"}}
        )
        logger.info(f"[SUCCESS] Appointment {appointment_id} status dynamically flipped to approved.")
        
        patient_id = appointment["patient_id"]
        doctor_id = appointment["doctor_id"]
        
        # 3. Spawn MOCK Patient SMS concurrently (Non-Blocking)
        asyncio.create_task(
            send_mock_patient_sms(
                patient_id=patient_id,
                message=f"Your appointment with Doctor ID {doctor_id} is successfully confirmed."
            )
        )
        
        # 4. Delegate to decoupled DRY Notification Background Dispatcher
        title = "New Appointment Approved"
        body = f"Appointment {appointment_id} for Patient {patient_id} has been fully approved."
        asyncio.create_task(_notify_appointment_stakeholders(doctor_id, title, body))
            
        return {"status": "success", "message": "Appointment intelligently approved and push payload distributed."}
        
    except AppException:
        raise
    except Exception as e:
        logger.error(f"[ERROR] Intense approval workflow failed critically for {appointment_id}: {e}", exc_info=True)
        raise AppException(
            detail="Failed to dynamically complete appointment approval workflow.",
            code="APPROVAL_WORKFLOW_FAILED",
            status_code=500
        )

async def fetch_appointments(status: str = None, limit: int = 20, skip: int = 0) -> list:
    db = get_db()
    try:
        query = {}
        if status:
            query["status"] = status
            
        logger.info(f"Fetching appointments safely | limit: {limit} | skip: {skip} | status: {status}")
        cursor = db.appointments.find(query).sort("appointment_time", pymongo.DESCENDING).skip(skip).limit(limit)
        
        appointments = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            appointments.append(doc)
            
        logger.info(f"[SUCCESS] Successfully retrieved {len(appointments)} decoupled booking records.")
        return appointments
        
    except Exception as e:
        logger.error(f"[ERROR] Safely protected fetch error: {e}", exc_info=True)
        raise AppException(
            detail="Failed to securely read appointment aggregation.",
            code="APPOINTMENT_FETCH_FAILED",
            status_code=500
        )
