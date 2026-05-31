import json
import logging
from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId
from fastapi import HTTPException, status
from pymongo import ReturnDocument
from redis.asyncio import Redis as AsyncRedis

from config.settings import settings
from models.submission import Submission, SubmissionStatus
from models.user import Role, User
from models.workflow_event import WorkflowAction, WorkflowEvent
from core.notifications.tasks import (
    notify_committee_approved,
    notify_committee_rejected,
    notify_hod_approved,
    notify_hod_new_submission,
    notify_hod_rejected,
    notify_submission_created,
)
from core.workflow.state_machine import (
    ACTIONS_REQUIRING_NOTE,
    InvalidTransitionError,
    transition,
)

logger = logging.getLogger(__name__)


async def execute_transition(
    submission_id: str,
    action: WorkflowAction,
    actor: User,
    note: Optional[str] = None,
) -> Submission:
    # 1. LOAD
    try:
        oid = PydanticObjectId(submission_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    submission = await Submission.get(oid)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    # 2. OWNERSHIP CHECK
    if action in (WorkflowAction.SUBMIT, WorkflowAction.WITHDRAW):
        if submission.submitter_id != actor.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your submission")

    if action == WorkflowAction.RESUBMIT:
        if submission.status == SubmissionStatus.REJECTED_HOD:
            if submission.submitter_id != actor.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your submission")
        elif submission.status == SubmissionStatus.REJECTED_COMM:
            if actor.role != Role.HOD or submission.department_id not in actor.department_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot act on submissions outside your department",
                )

    # 3. DEPARTMENT SCOPE CHECK
    if actor.role == Role.HOD and action in (WorkflowAction.APPROVE, WorkflowAction.REJECT):
        if submission.department_id not in actor.department_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot act on submissions outside your department",
            )

    # 4. MANDATORY NOTE CHECK
    if action in ACTIONS_REQUIRING_NOTE:
        if not note or len(note.strip()) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rejection note is mandatory (min 10 chars)",
            )

    # 5. STATE MACHINE
    try:
        new_status = transition(submission.status, action, actor.role)
    except InvalidTransitionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # 6. ATOMIC STATUS UPDATE (optimistic concurrency control)
    old_status = submission.status
    result = await Submission.get_motor_collection().find_one_and_update(
        {"_id": submission.id, "status": old_status.value},
        {"$set": {"status": new_status.value, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Concurrent modification detected")

    # 7. AUDIT LOG
    event = WorkflowEvent(
        submission_id=submission.id,
        actor_id=actor.id,
        actor_role=actor.role,
        action=action,
        from_status=old_status,
        to_status=new_status,
        note=note.strip() if note else None,
    )
    await event.insert()

    # 7b. DISPATCH NOTIFICATION TASKS via Celery (fire-and-forget)
    _sub_id = str(submission.id)
    _human_id = submission.submission_id or _sub_id
    _dept_id = str(submission.department_id)
    _submitter_id = str(submission.submitter_id)

    if new_status == SubmissionStatus.PENDING_HOD:
        if old_status == SubmissionStatus.DRAFT:
            notify_submission_created.delay(_submitter_id, _sub_id, _human_id)
        notify_hod_new_submission.delay(_dept_id, actor.college_id, _sub_id, _human_id)
    elif new_status == SubmissionStatus.PENDING_COMMITTEE:
        notify_hod_approved.delay(_submitter_id, _sub_id, _human_id)
    elif new_status == SubmissionStatus.APPROVED:
        notify_committee_approved.delay(_submitter_id, _dept_id, _sub_id, _human_id)
    elif new_status == SubmissionStatus.REJECTED_HOD:
        notify_hod_rejected.delay(_submitter_id, _sub_id, _human_id, note or "")
    elif new_status == SubmissionStatus.REJECTED_COMM:
        notify_committee_rejected.delay(_dept_id, _sub_id, _human_id, note or "")

    # Phase 4: Snapshot approved submission into the immutable repository
    if new_status == SubmissionStatus.APPROVED:
        try:
            from core.services.repository_service import finalize_submission
            refreshed_sub = await Submission.get(submission.id)
            await finalize_submission(refreshed_sub)
        except Exception as exc:
            logger.error("Repository finalization failed for %s: %s", submission.id, exc)

    # Bust the dashboard cache so the next public request sees fresh counts
    if new_status == SubmissionStatus.APPROVED:
        try:
            from core.services.dashboard_service import invalidate_dashboard_cache
            await invalidate_dashboard_cache()
        except Exception as exc:
            logger.warning("Dashboard cache invalidation failed: %s", exc)

    # 8. PUBLISH to Redis for WebSocket subscribers
    try:
        redis = AsyncRedis.from_url(settings.REDIS_URL, decode_responses=True)
        channel = f"submission:{str(submission.id)}"
        payload = json.dumps({
            "type": "status_update",
            "submission_id": str(submission.id),
            "submission_human_id": submission.submission_id,
            "old_status": old_status.value,
            "new_status": new_status.value,
            "actor_role": actor.role.value,
            "note": note,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await redis.publish(channel, payload)
        await redis.close()
    except Exception as exc:
        logger.warning("Redis publish failed: %s", exc)

    # 9. RETURN fresh document
    updated = await Submission.get(submission.id)
    return updated


async def get_submission_timeline(submission_id: str) -> list[WorkflowEvent]:
    return (
        await WorkflowEvent.find(
            WorkflowEvent.submission_id == PydanticObjectId(submission_id)
        )
        .sort(+WorkflowEvent.timestamp)
        .to_list()
    )
