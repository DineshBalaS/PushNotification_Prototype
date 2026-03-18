from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logger import setup_logger
from app.core.exceptions import (
    AppException, 
    global_app_exception_handler, 
    global_unhandled_exception_handler
)

# Initialize structured logging
logger = setup_logger()
logger.info("Initializing Push Notification Prototype Backend...")

app = FastAPI(
    title="Push Notification Prototype API",
    description="Decoupled API for handling real-time push routing.",
    version="1.0.0"
)

# Configure explicit CORS logic reading from our secure .env
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount global exception handlers to strictly adhere to formatting constraints
app.add_exception_handler(AppException, global_app_exception_handler)
app.add_exception_handler(Exception, global_unhandled_exception_handler)

@app.get("/health")
async def health_check():
    """Basic endpoint to verify CORS and routing."""
    return {"status": "ok", "message": "API is online"}
