from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logger import setup_logger
from app.core.exceptions import (
    AppException, 
    global_app_exception_handler, 
    global_unhandled_exception_handler
)
from contextlib import asynccontextmanager
from app.db.database import connect_to_mongo, close_mongo_connection

from app.routers.tokens import router as tokens_router
from app.routers.appointments import router as appointments_router
from app.routers.notifications import router as notifications_router
from app.routers.doctors import router as doctors_router

# Initialize structured logging
logger = setup_logger()
logger.info("Initializing Push Notification Prototype Backend...")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    await connect_to_mongo()
    yield
    # Shutdown actions
    await close_mongo_connection()

app = FastAPI(
    title="Push Notification Prototype API",
    description="Decoupled API for handling real-time push routing.",
    version="1.0.0",
    lifespan=lifespan
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

# Securely inject external routers mapping strictly to the internal API tree
app.include_router(tokens_router)
app.include_router(appointments_router)
app.include_router(notifications_router)
app.include_router(doctors_router)

@app.get("/health")
async def health_check():
    """Basic endpoint to verify CORS and routing."""
    return {"status": "ok", "message": "API is online"}
