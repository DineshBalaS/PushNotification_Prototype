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
    name: str
    phone_number: str
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=current_time)


class Staff(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    role: str = "receptionist"
    glenogi_fcm_token: Optional[str] = None
    created_at: datetime = Field(default_factory=current_time)


class Doctor(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    specialty: str
    glenogi_fcm_token: Optional[str] = None
    created_at: datetime = Field(default_factory=current_time)


class Appointment(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    patient_id: str
    doctor_id: str
    status: str = "PENDING"  # PENDING | ACCEPTED
    appointment_time: datetime
    created_at: datetime = Field(default_factory=current_time)
