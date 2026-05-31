from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies.auth_deps import get_current_user
from models.user import User
from core.schemas.notification_schemas import (
    NotificationListResponse,
    NotificationResponse,
    notification_to_response,
)
from core.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _require_valid_oid(notification_id: str) -> str:
    from beanie import PydanticObjectId
    try:
        PydanticObjectId(notification_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid notification ID format",
        )
    return notification_id


# GET /notifications/unread-count — MUST be before /{notification_id}/read
@router.get("/unread-count")
async def get_unread_count(user: User = Depends(get_current_user)):
    count = await notification_service.get_unread_count(user.id)
    return {"unread_count": count}


# PATCH /notifications/read-all — MUST be before /{notification_id}/read
@router.patch("/read-all")
async def mark_all_read(user: User = Depends(get_current_user)):
    count = await notification_service.mark_all_read(user.id)
    return {"message": f"Marked {count} notifications as read"}


# GET /notifications
@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    notifications, unread_count = await notification_service.get_user_notifications(
        user.id, page, page_size
    )
    return NotificationListResponse(
        notifications=[notification_to_response(n) for n in notifications],
        unread_count=unread_count,
    )


# PATCH /notifications/{notification_id}/read
@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: str,
    user: User = Depends(get_current_user),
):
    _require_valid_oid(notification_id)
    notif = await notification_service.mark_as_read(notification_id, user.id)
    return notification_to_response(notif)
