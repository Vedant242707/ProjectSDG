import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, status
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse

from core.services import dashboard_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
async def get_dashboard_summary():
    """Public endpoint — no auth required. Returns cached aggregate dashboard data."""
    return await dashboard_service.get_cached_dashboard()


@router.get("/stream")
async def dashboard_stream(request: Request):
    """
    Public SSE endpoint. Pushes a fresh dashboard snapshot every 30 seconds.
    Clients connect once and receive live updates without polling.
    """
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            try:
                summary = await dashboard_service.get_cached_dashboard()
                yield {
                    "event": "dashboard_update",
                    "data": json.dumps(summary, default=str),
                }
            except Exception as exc:
                logger.warning("SSE dashboard error: %s", exc)
                yield {
                    "event": "error",
                    "data": json.dumps({"error": str(exc)}),
                }
            await asyncio.sleep(30)

    return EventSourceResponse(event_generator())


# MUST be declared before /{sdg_number} would conflict — no conflict here, but
# explicit ordering: /summary and /stream are already above.
@router.get("/sdg/{sdg_number}")
async def get_sdg_stats(sdg_number: int):
    """Public endpoint. Returns stats for a single SDG (1-17)."""
    if sdg_number < 1 or sdg_number > 17:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SDG number must be between 1 and 17",
        )
    summary = await dashboard_service.get_cached_dashboard()
    for entry in summary["sdg_breakdown"]:
        if entry["sdg_number"] == sdg_number:
            return entry
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SDG entry not found")


@router.get("/sdg/{sdg_number}/details")
async def get_sdg_details(sdg_number: int):
    """Public endpoint. Returns full per-department and per-submitter breakdown for a single SDG."""
    if sdg_number < 1 or sdg_number > 17:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SDG number must be between 1 and 17",
        )
    return await dashboard_service.get_sdg_detail(sdg_number)

