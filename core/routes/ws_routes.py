import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from redis.asyncio import Redis as AsyncRedis

from config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Real-time"])


@router.websocket("/ws/submissions/{submission_id}")
async def submission_status_ws(
    websocket: WebSocket,
    submission_id: str,
    token: str = Query(...),
) -> None:
    """
    WebSocket for live submission status tracking.
    Client connects with: ws://host/ws/submissions/{id}?token=JWT_TOKEN

    Authentication uses the token query param because browsers cannot send
    Authorization headers in the WebSocket handshake.
    """
    from beanie import PydanticObjectId
    from jose import JWTError, jwt

    from models.submission import Submission

    # Authenticate — close before accept() so we don't upgrade the connection
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = payload.get("user_id")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Verify the submission exists (basic existence check — not role-scoped here)
    try:
        submission = await Submission.get(PydanticObjectId(submission_id))
    except Exception:
        await websocket.close(code=4004, reason="Submission not found")
        return

    if submission is None:
        await websocket.close(code=4004, reason="Submission not found")
        return

    await websocket.accept()

    redis = AsyncRedis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis.pubsub()
    channel = f"submission:{submission_id}"
    await pubsub.subscribe(channel)

    try:
        # Push current status immediately on connect so the client never has to poll
        await websocket.send_json({
            "type": "status",
            "submission_id": submission_id,
            "status": submission.status.value,
            "updated_at": submission.updated_at.isoformat(),
        })

        while True:
            # Wait up to 1 s for a Redis message before looping back to check client
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if message and message["type"] == "message":
                await websocket.send_text(message["data"])

            # Non-blocking check for a client ping (or disconnect)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WebSocket error for submission %s: %s", submission_id, exc)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        await redis.close()
