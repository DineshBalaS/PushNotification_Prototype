import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger("fastapi_app")

class AppException(Exception):
    """
    Base application exception to ensure strict, standardized JSON error responses.
    """
    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.detail = detail
        self.code = code
        self.status_code = status_code

async def global_app_exception_handler(request: Request, exc: AppException):
    """
    Catches our manual business logic exceptions.
    """
    logger.error(f"AppException: {exc.code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
    )

async def global_unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catches completely unexpected errors, preventing raw stack traces from leaking.
    """
    logger.error(f"Unhandled Server Error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected server error occurred.", "code": "INTERNAL_SERVER_ERROR"},
    )
