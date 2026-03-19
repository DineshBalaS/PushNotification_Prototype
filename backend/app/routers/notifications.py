from fastapi import APIRouter, Query
from app.services.inbox_service import get_user_notifications

router = APIRouter(prefix="/notifications", tags=["System Inbox"])

@router.get("/")
async def get_notifications(
    user_id: str = Query(..., description="ID bound strictly to the calling user context."),
    limit: int = Query(20, description="Strict pagination max volume configuration."),
    skip: int = Query(0, description="Cursor location for memory optimization.")
):
    """Retrieve indexed array of all notifications utilizing backend skip/limit functionality."""
    return await get_user_notifications(user_id=user_id, limit=limit, skip=skip)
