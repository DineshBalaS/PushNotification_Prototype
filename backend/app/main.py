from contextlib import asynccontextmanager
from pathlib import Path

import firebase_admin
from firebase_admin import credentials
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import (
    AppException,
    global_app_exception_handler,
    global_unhandled_exception_handler,
)
from app.core.logger import setup_logger
from app.db.database import close_mongo_connection, connect_to_mongo
from app.routers.appointments import router as appointments_router
from app.routers.doctors import router as doctors_router
from app.routers.providers import router as providers_router

logger = setup_logger()
logger.info("Initializing Push Notification Backend...")
logger.info(
    "Novu: API base %s; FCM integration %s.",
    settings.novu_server_url or "default (US)",
    settings.novu_fcm_integration_identifier or "default",
)
logger.debug(
    "Novu settings detail: server_url=%r fcm_integration_identifier=%r",
    settings.novu_server_url,
    settings.novu_fcm_integration_identifier,
)


def _init_firebase() -> None:
    """Initialize the Firebase Admin SDK once using the service account JSON."""
    if firebase_admin._apps:
        logger.info("Firebase Admin SDK already initialized.")
        return

    cred_path = Path(settings.firebase_credentials_path)
    if not cred_path.exists():
        logger.error(f"Firebase credentials not found at: {cred_path.resolve()}")
        raise FileNotFoundError(
            f"Firebase service account JSON missing: {cred_path.resolve()}"
        )

    cred = credentials.Certificate(str(cred_path))
    firebase_admin.initialize_app(cred)
    logger.info(f"Firebase Admin SDK initialized from: {cred_path.resolve()}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_firebase()
    await connect_to_mongo()
    yield
    await close_mongo_connection()


app = FastAPI(
    title="Push Notification API",
    description="Stateless, event-driven FCM push notification backend.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppException, global_app_exception_handler)
app.add_exception_handler(Exception, global_unhandled_exception_handler)

app.include_router(providers_router)
app.include_router(doctors_router)
app.include_router(appointments_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "2.0.0"}
