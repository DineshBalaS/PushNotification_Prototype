from fastapi import APIRouter
from app.models.schemas import TokenRegistrationRequest
from app.services.token_service import register_device_token

router = APIRouter(prefix="/tokens", tags=["Token Registry Base"])

@router.post("/register")
async def register_token(request: TokenRegistrationRequest):
    """Firmly registers a native OS token mapped into the localized application schema."""
    return await register_device_token(request)
