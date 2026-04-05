from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone


class PyObjectId(str):
    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type, _handler):
        from pydantic_core import core_schema
        return core_schema.str_schema()


def current_time():
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------
# Core Entity Collections  (exactly 4: patients, staff, doctor, appointments)
# ------------------------------------------------------------------

class Patient(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    user_id: str = Field(
        ...,
        description="Stable UUID string; use as Novu subscriberId if the patient ever receives notifications.",
    )
    name: str
    phone_number: str
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=current_time)


class Staff(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    """Stable application id; use as Novu subscriberId for this staff member."""
    user_id: str
    name: str
    role: str = "receptionist"
    glenogi_fcm_token: Optional[str] = None
    created_at: datetime = Field(default_factory=current_time)


class Doctor(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    """Stable application id; use as Novu subscriberId for this doctor."""
    user_id: str
    name: str
    specialty: str
    glenogi_fcm_token: Optional[str] = None
    created_at: datetime = Field(default_factory=current_time)


class Appointment(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    patient_id: str
    doctor_id: str
    doctor_user_id: Optional[str] = Field(
        default=None,
        description="Copied from the assigned doctor at booking time (Novu subscriberId).",
    )
    status: str = "PENDING"  # PENDING | ACCEPTED
    appointment_time: datetime
    created_at: datetime = Field(default_factory=current_time)
