from fastapi import APIRouter, Query
from app.models.schemas import AppointmentCreateRequest
from app.services.appointment_service import create_appointment, approve_appointment, fetch_appointments

router = APIRouter(prefix="/appointments", tags=["Booking Control"])

@router.post("/request", status_code=201)
async def request_appointment(request: AppointmentCreateRequest):
    """Accepts unauthenticated frontend payload structures mapped rigidly to pure Pydantic constraints."""
    return await create_appointment(request)

@router.post("/{appointment_id}/approve", status_code=200)
async def safely_approve_appointment(appointment_id: str):
    """Triggers internal decoupled event architectures simulating async Firebase logic blocks."""
    return await approve_appointment(appointment_id)

@router.get("/")
async def get_appointments(
    status: str = Query(None, description="Optional status query (pending vs approved)."),
    limit: int = Query(20, description="Strict memory limit bounding pagination limit."),
    skip: int = Query(0, description="Offset scale parameter.")
):
    """Retrieves paginated appointment arrays securely without bounding infinite data loads."""
    return await fetch_appointments(status=status, limit=limit, skip=skip)
