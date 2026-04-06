"""
Novu workflow triggers (novu-py). Used from BackgroundTasks — must not raise to callers.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Sequence

from novu_py import models

from app.core.logger import setup_logger
from app.services.novu_subscribers import get_novu_client

logger = setup_logger()

# Novu API: max recipients per trigger (see novu_py TriggerEventRequestDto docstring).
_MAX_TRIGGER_RECIPIENTS = 100


def _normalize_subscriber_ids(subscriber_ids: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in subscriber_ids:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _json_friendly_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Coerce values for Novu payload (templates / push data expect plain JSON scalars)."""
    out: dict[str, Any] = {}
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, (str, int, float, bool)):
            out[key] = value
        else:
            out[key] = str(value)
    return out


async def trigger_novu_workflow(
    *,
    workflow_id: str,
    subscriber_ids: Sequence[str],
    payload: dict[str, Any],
    transaction_id: str | None = None,
) -> None:
    """
    Trigger any Novu workflow for the given subscriber ids.

    Swallows Novu/network errors after logging — safe inside FastAPI BackgroundTasks.
    """
    recipients = _normalize_subscriber_ids(subscriber_ids)
    if not recipients:
        logger.warning(
            "Novu workflow trigger skipped | workflow_id=%s | reason=no_valid_subscriber_ids",
            workflow_id,
        )
        return

    if len(recipients) > _MAX_TRIGGER_RECIPIENTS:
        logger.error(
            "Novu workflow recipient count %s exceeds max %s; truncating | workflow_id=%s",
            len(recipients),
            _MAX_TRIGGER_RECIPIENTS,
            workflow_id,
        )
        recipients = recipients[:_MAX_TRIGGER_RECIPIENTS]

    friendly = _json_friendly_payload(payload)
    dto: models.TriggerEventRequestDtoTypedDict = {
        "workflow_id": workflow_id,
        "to": recipients,
        "payload": friendly,
    }
    if transaction_id:
        dto["transaction_id"] = transaction_id

    client = get_novu_client()
    try:
        await client.trigger_async(trigger_event_request_dto=dto)
        logger.info(
            "Novu workflow triggered | workflow_id=%s | recipients=%s | transaction_id=%s",
            workflow_id,
            len(recipients),
            transaction_id or "(none)",
        )
    except models.NovuError as exc:
        body_preview = (exc.body or "")[:800]
        logger.error(
            "Novu trigger failed | workflow_id=%s http_status=%s message=%s",
            workflow_id,
            exc.status_code,
            str(exc)[:500],
        )
        logger.debug("Novu trigger error body preview | preview=%r", body_preview)
    except Exception:
        logger.exception(
            "Novu trigger unexpected error | workflow_id=%s recipients=%s",
            workflow_id,
            len(recipients),
        )
