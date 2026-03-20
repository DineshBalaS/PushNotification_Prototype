from contextlib import asynccontextmanager

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
from app.routers.providers import router as providers_router

logger = setup_logger()
logger.info("Initializing Push Notification Backend...")


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppException, global_app_exception_handler)
app.add_exception_handler(Exception, global_unhandled_exception_handler)

app.include_router(providers_router)
app.include_router(appointments_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "2.0.0"}
