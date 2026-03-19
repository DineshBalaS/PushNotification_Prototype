import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.models.domain import Patient, Staff, Doctor
from faker import Faker

fake = Faker()

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
        d = Doctor(
            name=f"Dr. {fake.last_name()}",
            specialty=specialties[i]
        )
        doctors.append(d.model_dump(by_alias=True, exclude_none=True))
        
    if doctors:
        await db.doctor.insert_many(doctors)

    print("Generating 1 Staff Member...")
    s = Staff(
        name=fake.name(),
        role="receptionist"
    )
    await db.staff.insert_one(s.model_dump(by_alias=True, exclude_none=True))

    print("✅ Database successfully populated with 10 Patients, 3 Doctors, and 1 Staff.")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed())
