from fastapi import APIRouter, Query
from app.services.doctor_service import fetch_doctors

router = APIRouter(prefix="/doctors", tags=["Staff Roster Overview"])

@router.get("/")
async def get_doctors(
    limit: int = Query(20, description="Strict pagination max volume memory constraint."),
    skip: int = Query(0, description="Offset cursor logic.")
):
    """Retrieve indexed array of all available doctors securely fetching from decoupled services."""
    return await fetch_doctors(limit=limit, skip=skip)
