from typing import List, Optional

from pydantic import BaseModel, Field

from models.notification import Notification


class NotificationResponse(BaseModel):
    id: str = Field(..., alias="_id")
    user_id: str
    message: str
    submission_id: Optional[str]
    read: bool
    created_at: str

    model_config = {"populate_by_name": True}


class NotificationListResponse(BaseModel):
    notifications: List[NotificationResponse]
    unread_count: int


def notification_to_response(notif: Notification) -> dict:
    return {
        "_id": str(notif.id),
        "user_id": str(notif.user_id),
        "message": notif.message,
        "submission_id": str(notif.submission_id) if notif.submission_id else None,
        "read": notif.read,
        "created_at": notif.created_at.isoformat(),
    }
