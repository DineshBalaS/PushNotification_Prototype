import asyncio
import uuid

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.logger import setup_logger
from app.models.domain import Doctor, Patient, Staff
from faker import Faker

fake = Faker()
logger = setup_logger()

async def seed():
    print("Initializing Database Seeding Process...")
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_db_name]
    
    # Soft Reset to prevent duplication on multiple executions
    print("Clearing legacy mock data from collections...")
    await db.patient.delete_many({})
    await db.staff.delete_many({})
    await db.doctor.delete_many({})
    
    print("Generating 10 Mock Patients...")
    patients = []
    for _ in range(10):
        p = Patient(
            name=fake.name(),
            phone_number=fake.phone_number(),
            email=fake.email()
        )
        # Dump using Pydantic, excluding None to let Mongo auto-generate ObjectIDs
        patients.append(p.model_dump(by_alias=True, exclude_none=True))
        
    if patients:
        await db.patient.insert_many(patients)

    print("Generating 3 Mock Doctors...")
    specialties = ["Orthodontics", "Endodontics", "Periodontics"]
    doctors = []
    for i in range(3):
        uid = str(uuid.uuid4())
        d = Doctor(
            user_id=uid,
            name=f"Dr. {fake.last_name()}",
            specialty=specialties[i],
        )
        payload = d.model_dump(by_alias=True, exclude_none=True)
        doctors.append(payload)
        logger.debug(
            "Seed: prepared doctor name=%s specialty=%s user_id=%s",
            payload.get("name"),
            payload.get("specialty"),
            uid,
        )

    if doctors:
        await db.doctor.insert_many(doctors)
        logger.info("Seed: inserted %s doctor documents with unique user_id", len(doctors))

    print("Generating 1 Staff Member...")
    staff_uid = str(uuid.uuid4())
    s = Staff(
        user_id=staff_uid,
        name=fake.name(),
        role="receptionist",
    )
    staff_doc = s.model_dump(by_alias=True, exclude_none=True)
    await db.staff.insert_one(staff_doc)
    logger.debug(
        "Seed: inserted staff name=%s role=%s user_id=%s",
        staff_doc.get("name"),
        staff_doc.get("role"),
        staff_uid,
    )
    logger.info("Seed: inserted 1 staff document with user_id")

    print("✅ Database successfully populated with 10 Patients, 3 Doctors, and 1 Staff.")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed())
