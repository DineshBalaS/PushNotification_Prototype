import asyncio
from typing import Any

import firebase_admin
from firebase_admin import messaging
from app.core.logger import setup_logger

logger = setup_logger()


def _send_fcm_blocking(token: str, title: str, body: str, data_payload: dict[str, Any]) -> bool:
    """
    Synchronous FCM dispatch.  Runs inside a thread-pool executor so it
    never blocks the asyncio event loop.
    """
    try:
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            # FCM data values must all be strings
            data={k: str(v) for k, v in data_payload.items()},
            token=token,
        )
        response = messaging.send(message)
        logger.info(f"FCM dispatch success | message_id={response}")
        return True
    except messaging.UnregisteredError:
        logger.warning(f"FCM token is unregistered and will be skipped: {token[:20]}...")
        return False
    except firebase_admin.exceptions.FirebaseError as e:
        logger.error(f"Firebase error during FCM dispatch: {e}", exc_info=True)
        return False
    except Exception as e:
        logger.error(f"Unexpected error during FCM dispatch: {e}", exc_info=True)
        return False


async def dispatch_fcm_notification(
    token: str,
    title: str,
    body: str,
    data_payload: dict[str, Any],
) -> bool:
    """
    Async entry point for FCM dispatch.  Offloads the blocking Firebase SDK
    call to the default thread-pool executor, keeping the event loop free.

    Designed to be called exclusively via BackgroundTasks.add_task() so
    that HTTP responses are returned before FCM completes.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _send_fcm_blocking, token, title, body, data_payload)
