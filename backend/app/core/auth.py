async def get_current_provider() -> dict:
    """
    Auth stub for the prototype.  Replace with real JWT/session decoding before production.

    Returns a mock provider context that downstream routes use to identify
    which doctor/staff document to update.  The 'collection' key drives
    the Motor collection name used in the PATCH /me/fcm-token route.
    """
    return {
        "id": "doc_123",
        "role": "doctor",
        "collection": "doctor",
    }
