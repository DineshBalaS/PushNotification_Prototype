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
