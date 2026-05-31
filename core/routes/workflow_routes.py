from datetime import datetime, timezone
from typing import List

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies.auth_deps import get_current_user
from models.submission import Submission, SubmissionStatus
from models.user import User
from models.workflow_event import WorkflowAction
from core.schemas.submission_schemas import (
    ApproveRequest,
    RejectRequest,
    ResubmitRequest,
    SubmissionResponse,
    WorkflowEventResponse,
    submission_to_response,
    workflow_event_to_response,
)
from core.services import workflow_service

router = APIRouter(prefix="/submissions", tags=["Workflow"])


def _require_valid_oid(id: str) -> str:
    try:
        PydanticObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid submission ID format",
        )
    return id


# POST /submissions/{id}/submit
@router.post("/{id}/submit", response_model=SubmissionResponse)
async def submit(id: str, user: User = Depends(get_current_user)):
    _require_valid_oid(id)
    sub = await workflow_service.execute_transition(id, WorkflowAction.SUBMIT, user)
    return submission_to_response(sub)


# POST /submissions/{id}/approve
@router.post("/{id}/approve", response_model=SubmissionResponse)
async def approve(
    id: str,
    body: ApproveRequest,
    user: User = Depends(get_current_user),
):
    _require_valid_oid(id)
    sub = await workflow_service.execute_transition(id, WorkflowAction.APPROVE, user, note=body.note)
    return submission_to_response(sub)


# POST /submissions/{id}/reject
@router.post("/{id}/reject", response_model=SubmissionResponse)
async def reject(
    id: str,
    body: RejectRequest,
    user: User = Depends(get_current_user),
):
    _require_valid_oid(id)
    sub = await workflow_service.execute_transition(id, WorkflowAction.REJECT, user, note=body.note)
    return submission_to_response(sub)


# POST /submissions/{id}/resubmit
@router.post("/{id}/resubmit", response_model=SubmissionResponse)
async def resubmit(
    id: str,
    body: ResubmitRequest,
    user: User = Depends(get_current_user),
):
    _require_valid_oid(id)

    # Pre-edit: only the submitter can amend content on a REJECTED_HOD submission.
    # REJECTED_COMM resubmits are HOD-driven — content is not changed.
    submission = await Submission.get(PydanticObjectId(id))
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if submission.status == SubmissionStatus.REJECTED_HOD and submission.submitter_id == user.id:
        changed = False
        if body.title is not None:
            submission.title = body.title
            changed = True
        if body.description is not None:
            submission.description = body.description
            changed = True
        if body.type is not None:
            submission.type = body.type
            changed = True
        if body.sdg_tags is not None:
            submission.sdg_tags = body.sdg_tags
            changed = True
        if changed:
            submission.updated_at = datetime.now(timezone.utc)
            await submission.save()

    sub = await workflow_service.execute_transition(id, WorkflowAction.RESUBMIT, user, note=body.note)
    return submission_to_response(sub)


# POST /submissions/{id}/withdraw
@router.post("/{id}/withdraw", response_model=SubmissionResponse)
async def withdraw(id: str, user: User = Depends(get_current_user)):
    _require_valid_oid(id)
    sub = await workflow_service.execute_transition(id, WorkflowAction.WITHDRAW, user)
    return submission_to_response(sub)


# GET /submissions/{id}/timeline
@router.get("/{id}/timeline", response_model=List[WorkflowEventResponse])
async def get_timeline(id: str, user: User = Depends(get_current_user)):
    _require_valid_oid(id)
    events = await workflow_service.get_submission_timeline(id)
    return [workflow_event_to_response(e) for e in events]
