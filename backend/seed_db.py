import argparse
import asyncio
import uuid
from typing import Literal, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.logger import setup_logger
from app.models.domain import Doctor, Patient, Staff
from faker import Faker

fake = Faker()
logger = setup_logger()

DEFAULT_PATIENT_COUNT = 10


async def _seed_patients(db, *, count: int) -> int:
    """Insert ``count`` patient documents, each with a unique ``user_id`` (UUID v4)."""
    if count < 1:
        raise ValueError("count must be at least 1")

    patients: list[dict] = []
    seen_user_ids: set[str] = set()

    for _ in range(count):
        uid = str(uuid.uuid4())
        while uid in seen_user_ids:
            uid = str(uuid.uuid4())
        seen_user_ids.add(uid)

        patient = Patient(
            user_id=uid,
            name=fake.name(),
            phone_number=fake.phone_number(),
            email=fake.email(),
        )
        patients.append(patient.model_dump(by_alias=True, exclude_none=True))
        logger.debug("Seed: prepared patient name=%s user_id=%s", patient.name, uid)

    await db.patient.insert_many(patients)
    logger.info("Seed: inserted %s patient documents with unique user_id", len(patients))
    return len(patients)


async def _seed_full(db, *, patient_count: int) -> None:
    print("Clearing legacy mock data from collections...")
    await db.patient.delete_many({})
    await db.staff.delete_many({})
    await db.doctor.delete_many({})

    print(f"Generating {patient_count} Mock Patients...")
    await _seed_patients(db, count=patient_count)

    print("Generating 3 Mock Doctors...")
    specialties = ["Orthodontics", "Endodontics", "Periodontics"]
    doctors: list[dict] = []
    for i in range(3):
        uid = str(uuid.uuid4())
        doctor = Doctor(
            user_id=uid,
            name=f"Dr. {fake.last_name()}",
            specialty=specialties[i],
        )
        payload = doctor.model_dump(by_alias=True, exclude_none=True)
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
    staff = Staff(
        user_id=staff_uid,
        name=fake.name(),
        role="receptionist",
    )
    staff_doc = staff.model_dump(by_alias=True, exclude_none=True)
    await db.staff.insert_one(staff_doc)
    logger.debug(
        "Seed: inserted staff name=%s role=%s user_id=%s",
        staff_doc.get("name"),
        staff_doc.get("role"),
        staff_uid,
    )
    logger.info("Seed: inserted 1 staff document with user_id")

    print(
        f"✅ Database successfully populated with {patient_count} Patients, 3 Doctors, and 1 Staff."
    )


async def _seed_patients_only(db, *, count: int) -> None:
    print("Patients-only mode: clearing ``patient`` collection only (doctor/staff untouched).")
    await db.patient.delete_many({})
    print(f"Generating {count} Mock Patients...")
    inserted = await _seed_patients(db, count=count)
    print(f"✅ Inserted {inserted} patient document(s) with user_id (UUID).")


async def seed(
    mode: Literal["all", "patients_only"],
    *,
    patient_count: int = DEFAULT_PATIENT_COUNT,
) -> None:
    print("Initializing Database Seeding Process...")
    client: Optional[AsyncIOMotorClient] = None
    try:
        client = AsyncIOMotorClient(settings.mongodb_url)
        db = client[settings.mongodb_db_name]

        if mode == "patients_only":
            await _seed_patients_only(db, count=patient_count)
        else:
            await _seed_full(db, patient_count=patient_count)
    finally:
        if client is not None:
            client.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed MongoDB with mock patients, doctors, and staff.",
    )
    parser.add_argument(
        "--patients-only",
        action="store_true",
        help="Only clear and repopulate the patient collection; leave doctor and staff as-is.",
    )
    parser.add_argument(
        "--patient-count",
        type=int,
        default=DEFAULT_PATIENT_COUNT,
        metavar="N",
        help=f"Number of patients to insert (default: {DEFAULT_PATIENT_COUNT}). "
        "Used with --patients-only or full seed (full seed currently uses this for patients only).",
    )
    args = parser.parse_args()
    if args.patient_count < 1:
        parser.error("--patient-count must be at least 1")
    return args


if __name__ == "__main__":
    cli = _parse_args()
    mode: Literal["all", "patients_only"] = (
        "patients_only" if cli.patients_only else "all"
    )
    asyncio.run(seed(mode, patient_count=cli.patient_count))
