from app.db.database import get_db
from app.core.logger import setup_logger

logger = setup_logger()


async def get_current_provider() -> dict:
    """
    Auth stub for the prototype.  Replace with real JWT/session decoding
    before production.

    Resolves the first doctor in the database so the returned id is always
    a valid MongoDB ObjectId.  Falls back to an in-memory placeholder only
    if the collection is empty (no seed data).
    """
    db = get_db()
    doctor = await db.doctor.find_one({}, {"_id": 1, "user_id": 1})

    if doctor:
        provider_id = str(doctor["_id"])
        uid = doctor.get("user_id")
        logger.info("[Auth Stub] Resolved provider object_id=%s", provider_id)
        logger.debug("[Auth Stub] provider user_id=%s", uid)
        return {
            "id": provider_id,
            "user_id": uid,
            "role": "doctor",
            "collection": "doctor",
        }

    logger.warning("[Auth Stub] No doctors in DB — returning placeholder.")
    return {
        "id": "000000000000000000000000",
        "role": "doctor",
        "collection": "doctor",
    }
