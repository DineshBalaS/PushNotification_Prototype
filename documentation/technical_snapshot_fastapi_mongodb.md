# Technical Snapshot: FastAPI + MongoDB Push Notification Prototype

**Report Date:** March 20, 2025  
**Purpose:** Current-state analysis for planning stateless, background-task-driven FCM push notification system migration.

---

## 1. Database Connection & Driver

### Driver Stack
- **Primary async driver:** `motor` (via `motor.motor_asyncio.AsyncIOMotorClient`)
- **Sync utilities:** `pymongo` (for index constants like `pymongo.ASCENDING` / `pymongo.DESCENDING`)

**No ODM in use** — raw Motor collections with Pydantic models for validation only. No Beanie, Odmantic, or similar.

### Connection Establishment & Injection

```python
# app/db/database.py
import pymongo
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.logger import setup_logger
from app.core.exceptions import AppException

logger = setup_logger()

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_config = Database()

async def connect_to_mongo():
    logger.info("Initializing connection to MongoDB...")
    try:
        db_config.client = AsyncIOMotorClient(settings.mongodb_url)
        db_config.db = db_config.client[settings.mongodb_db_name]
        logger.info(f"Connected to database: {settings.mongodb_db_name}")
        
        await _create_indexes()
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise AppException(
            detail="Database connection failure",
            code="DB_CONNECTION_ERROR",
            status_code=500
        )

async def _create_indexes():
    """Create collections and compound indexes for optimization."""
    logger.info("Setting up database automated indexing...")
    try:
        # Index on user_id and timestamp for efficient Notification Inbox fetching
        await db_config.db.notification_inbox.create_index(
            [("user_id", pymongo.ASCENDING), ("timestamp", pymongo.DESCENDING)]
        )
        
        # Index on owner_id for Device Tokens
        await db_config.db.device_tokens.create_index(
            [("owner_id", pymongo.ASCENDING)]
        )

        logger.info("Database structured indexes effectively established.")
    except Exception as e:
        logger.error(f"Failed to create MongoDB indexes: {e}")

async def close_mongo_connection():
    logger.info("Closing robust MongoDB connection...")
    if db_config.client:
        db_config.client.close()
        logger.info("MongoDB connection closed safely.")

def get_db():
    if db_config.db is None:
        raise RuntimeError("Database instance is not fully initialized")
    return db_config.db
```

**Injection pattern:** Routes do **not** use FastAPI `Depends(get_db)`. Services call `get_db()` directly when needed:

```python
# Example from appointment_service.py
db = get_db()
result = await db.appointments.insert_one(appointment_doc)
```

**Lifecycle:** DB connection is established in FastAPI lifespan (`app/main.py`):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()

app = FastAPI(..., lifespan=lifespan)
```

---

## 2. Current Schemas (Pydantic / DB Models)

### Domain Models (`app/models/domain.py`)

```python
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

class PyObjectId(str):
    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type, _handler):
        from pydantic_core import core_schema
        return core_schema.str_schema()

def current_time():
    return datetime.now(timezone.utc)

# -------------------------------------------------------------
# Core Entity Collections
# -------------------------------------------------------------

class Patient(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    phone_number: str
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=current_time)

class Staff(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    role: str = "receptionist"
    created_at: datetime = Field(default_factory=current_time)

class Doctor(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    specialty: str
    created_at: datetime = Field(default_factory=current_time)

class User(BaseModel):
    """Example collection to represent standard users. Not actively used in this prototype."""
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    username: str
    role: str
    created_at: datetime = Field(default_factory=current_time)

# -------------------------------------------------------------
# Prototype Collections
# -------------------------------------------------------------

class DeviceToken(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    owner_id: str
    owner_type: str  # e.g., 'doctor', 'staff'
    fcm_tokens: List[str] = Field(default_factory=list)

class Appointment(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    patient_id: str
    doctor_id: str
    status: str = "pending"  # 'pending', 'approved'
    appointment_time: datetime
    created_at: datetime = Field(default_factory=current_time)

class NotificationInbox(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    user_id: str
    title: str
    body: str
    is_read: bool = False
    timestamp: datetime = Field(default_factory=current_time)
```

### API Request DTOs (`app/models/schemas.py`)

```python
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from datetime import datetime

class TokenRegistrationRequest(BaseModel):
    """Payload to strictly map user devices to the backend FCM registry."""
    model_config = ConfigDict(extra='forbid')
    
    owner_id: str = Field(..., description="Internal DB ID of the staff or doctor")
    owner_type: Literal["doctor", "staff"] = Field(..., description="Roles securely partitioned for payload routing")
    fcm_token: str = Field(..., min_length=5, description="FCM device push token natively generated by Mobile apps")

class AppointmentCreateRequest(BaseModel):
    """Payload to handle active widget booking submissions rigidly."""
    model_config = ConfigDict(extra='forbid')
    
    patient_id: str = Field(..., description="ID of the patient requesting the appointment")
    doctor_id: str = Field(..., description="ID of the targeted doctor")
    appointment_time: datetime = Field(..., description="Appointment scheduling block (UTC)")
    
    # 'status' field is intentionally dropped here to prevent active frontend injection tampering. 
    # It must be enforced as 'pending' internally on initialization.
```

### FCM Token Injection Points for Provider Models

| Model | Current Fields | `fcm_token` Location |
|-------|----------------|----------------------|
| **Doctor** | `id`, `name`, `specialty`, `created_at` | No `fcm_token` field. FCM tokens live in **separate** `device_tokens` collection keyed by `owner_id` + `owner_type`. |
| **Staff** | `id`, `name`, `role`, `created_at` | Same as Doctor — tokens in `device_tokens`. |
| **Patient** | `id`, `name`, `phone_number`, `email`, `created_at` | No FCM support. |

**FCM tokens are stored in a separate `device_tokens` collection**, not in `Doctor` or `Staff`. To add `fcm_token` directly on provider models, you would need to add `fcm_token: Optional[str] = None` (or `fcm_tokens: List[str] = []`) to `Doctor` and `Staff` in `domain.py` and migrate the token logic accordingly.

---

## 3. Authentication & Dependency Injection

### Current State: No Authentication

- **No authentication or authorization** is implemented.
- No `get_current_user`, `get_current_doctor`, or similar dependencies.
- No JWT, OAuth, or session handling.

**Evidence:** All endpoints are unauthenticated:

- `POST /appointments/request` — docstring: "Accepts unauthenticated frontend payload structures"
- `POST /appointments/{id}/approve` — no auth required
- `GET /appointments/` — no auth
- `GET /doctors/` — no auth
- `POST /tokens/register` — no auth
- `GET /notifications/` — user_id passed as query param

**Routes:** None use `Depends()` for auth. `get_db()` is used as a module-level function, not as a FastAPI dependency.

---

## 4. Existing Appointment Routing

### Router (`app/routers/appointments.py`)

```python
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
```

### Appointment endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/appointments/request` | Create new appointment (status forced to `pending`) |
| `POST` | `/appointments/{appointment_id}/approve` | Update appointment status to `approved` |
| `GET` | `/appointments/` | List appointments with optional `status`, `limit`, `skip` |

### Service logic (create & approve)

**Create:** `appointment_service.create_appointment()` validates `patient_id` and `doctor_id`, inserts into `appointments`, then spawns `asyncio.create_task(_notify_appointment_stakeholders(...))` for non-blocking notifications.

**Approve:** `appointment_service.approve_appointment()` updates status to `approved`, spawns mock SMS task, and spawns `_notify_appointment_stakeholders()` for push notifications.

**Notifications:** `_notify_appointment_stakeholders()` writes to `notification_inbox` and resolves FCM tokens from `device_tokens` by `owner_id` (doctor + staff). `dispatch_internal_push()` is a stub (logs only; no real FCM).

---

## 5. Current Dependencies

**Note:** No `requirements.txt` or `pyproject.toml` was found in the repo. Dependencies inferred from imports:

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server (typically used with FastAPI) |
| `motor` | Async MongoDB driver |
| `pymongo` | Sync MongoDB utilities (index constants, etc.) |
| `pydantic` | Validation |
| `pydantic-settings` | Config |
| `pydantic-core` | Used by `PyObjectId` |
| `bson` | ObjectId (comes with pymongo) |
| `faker` | Seed data (dev only) |

**Suggested `requirements.txt` for reproducibility:**

```txt
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
motor>=3.3.0
pymongo>=4.6.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
faker>=22.0.0
```

---

## 6. Summary for FCM Migration Planning

| Area | Current State | Migration Notes |
|------|---------------|-----------------|
| **DB driver** | Motor (async) + pymongo | Suitable for background tasks |
| **DB injection** | `get_db()` called directly in services | Consider `Depends(get_db)` for testability |
| **FCM tokens** | Separate `device_tokens` collection | Can add `fcm_token` to Doctor/Staff if desired |
| **Auth** | None | Add auth before securing doctor/staff routes |
| **Background tasks** | `asyncio.create_task()` | No persistence; consider Celery/ARQ for stateless workers |
| **Push dispatch** | `dispatch_internal_push()` is a stub | Replace with Firebase Admin SDK |
| **Config** | `firebase_credentials_path` in settings | Ready for FCM credentials path |

---

*End of Technical Snapshot*
