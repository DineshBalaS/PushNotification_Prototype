"""
Novu subscriber + FCM push credentials (novu-py). Used for token registration and future triggers.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from novu_py import Novu
from novu_py import models

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.logger import setup_logger

logger = setup_logger()


@lru_cache
def _novu_client() -> Novu:
    kwargs: dict = {"secret_key": settings.novu_secret_key}
    if settings.novu_server_url:
        kwargs["server_url"] = settings.novu_server_url
    return Novu(**kwargs)


def get_novu_client() -> Novu:
    """Return the shared cached ``Novu`` instance (same config as subscriber sync)."""
    return _novu_client()


async def sync_subscriber_fcm_to_novu(
    *,
    user_id: str,
    fcm_token: str,
    display_name: Optional[str] = None,
) -> None:
    """
    Ensure a Novu subscriber exists for ``user_id`` (Novu create endpoint upserts),
    then PATCH-append FCM device token(s) for provider ``fcm``.
    """
    if not fcm_token or not fcm_token.strip():
        raise AppException(
            detail="FCM token is required.",
            code="INVALID_FCM_TOKEN",
            status_code=400,
        )

    client = _novu_client()
    token_stripped = fcm_token.strip()

    create_payload: models.CreateSubscriberRequestDtoTypedDict = {
        "subscriber_id": user_id,
    }
    if display_name and display_name.strip():
        create_payload["first_name"] = display_name.strip()

    logger.debug(
        "Novu: create/upsert subscriber | user_id=%s has_display_name=%s",
        user_id,
        bool(create_payload.get("first_name")),
    )

    try:
        await client.subscribers.create_async(
            create_subscriber_request_dto=create_payload,
        )
    except models.NovuError as exc:
        _raise_app_exception_from_novu(
            exc, step="create_subscriber", user_id=user_id
        )

    creds: models.ChannelCredentialsTypedDict = {
        "device_tokens": [token_stripped],
    }
    cred_request: models.UpdateSubscriberChannelRequestDtoTypedDict = {
        "provider_id": models.ChatOrPushProviderEnum.FCM,
        "credentials": creds,
    }
    if settings.novu_fcm_integration_identifier:
        cred_request["integration_identifier"] = settings.novu_fcm_integration_identifier

    logger.debug(
        "Novu: append FCM credentials | user_id=%s integration_identifier=%s token_prefix=%s...",
        user_id,
        settings.novu_fcm_integration_identifier or "(default)",
        token_stripped[:12],
    )

    try:
        await client.subscribers.credentials.append_async(
            subscriber_id=user_id,
            update_subscriber_channel_request_dto=cred_request,
        )
    except models.NovuError as exc:
        _raise_app_exception_from_novu(
            exc, step="append_fcm_credentials", user_id=user_id
        )

    logger.info(
        "Novu: subscriber + FCM credentials synced | user_id=%s token_prefix=%s...",
        user_id,
        token_stripped[:12],
    )


def _raise_app_exception_from_novu(
    exc: models.NovuError,
    *,
    step: str,
    user_id: str,
) -> None:
    body_preview = (exc.body or "")[:800]
    logger.error(
        "Novu API error | step=%s user_id=%s http_status=%s message=%s",
        step,
        user_id,
        exc.status_code,
        str(exc)[:500],
    )
    logger.debug("Novu API error body preview | step=%s preview=%r", step, body_preview)
    raise AppException(
        detail="Could not sync with the notification provider. Try again later.",
        code="NOVU_API_ERROR",
        status_code=502,
    )
