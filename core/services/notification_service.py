from typing import Optional

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from models.notification import Notification


async def create_notification(
    user_id: PydanticObjectId,
    message: str,
    submission_id: Optional[PydanticObjectId] = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        message=message,
        submission_id=submission_id,
    )
    await notif.insert()
    return notif


async def get_user_notifications(
    user_id: PydanticObjectId,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Notification], int]:
    query = Notification.find(Notification.user_id == user_id)
    notifications = (
        await query.sort(-Notification.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    unread_count = await Notification.find(
        Notification.user_id == user_id,
        Notification.read == False,  # noqa: E712
    ).count()
    return notifications, unread_count


async def mark_as_read(notification_id: str, user_id: PydanticObjectId) -> Notification:
    try:
        oid = PydanticObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notif = await Notification.get(oid)
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if notif.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your notification")

    notif.read = True
    await notif.save()
    return notif


async def mark_all_read(user_id: PydanticObjectId) -> int:
    result = await Notification.get_motor_collection().update_many(
        {"user_id": user_id, "read": False},
        {"$set": {"read": True}},
    )
    return result.modified_count


async def get_unread_count(user_id: PydanticObjectId) -> int:
    return await Notification.find(
        Notification.user_id == user_id,
        Notification.read == False,  # noqa: E712
    ).count()
