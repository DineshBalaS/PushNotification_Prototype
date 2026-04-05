from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.database import get_db
from app.core.logger import setup_logger
from app.models.schemas import DoctorListItem

logger = setup_logger()

router = APIRouter(prefix="/api/v1/doctors", tags=["Doctors"])


@router.get("/", response_model=list[DoctorListItem])
async def list_doctors(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Read-only list of doctors for prototype booking widgets.
    Projection-only read; does not mutate doctor documents or related collections.
    """
    logger.debug(
        "Doctors list: querying doctor collection projection=_id,name,specialty sort=name"
    )
    cursor = db.doctor.find({}, {"_id": 1, "name": 1, "specialty": 1}).sort("name", 1)
    items: list[DoctorListItem] = []
    async for doc in cursor:
        raw_name = doc.get("name")
        raw_specialty = doc.get("specialty")
        name = raw_name if isinstance(raw_name, str) else ""
        specialty = raw_specialty if isinstance(raw_specialty, str) else ""
        oid = doc.get("_id")
        if oid is None:
            logger.debug("Doctors list: skipping row with missing _id | doc_keys=%s", list(doc.keys()))
            continue
        items.append(
            DoctorListItem(
                id=str(oid),
                name=name,
                specialty=specialty,
            )
        )

    sample_ids = [d.id for d in items[:5]]
    logger.info(
        "Doctors list: returned count=%s sample_ids=%s",
        len(items),
        sample_ids,
    )
    logger.debug("Doctors list: full_ids=%s", [d.id for d in items])
    return items
