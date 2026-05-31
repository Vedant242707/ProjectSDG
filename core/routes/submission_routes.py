from typing import List

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies.auth_deps import get_current_user
from models.user import Role, User
from core.schemas.submission_schemas import (
    CreateSubmissionRequest,
    SubmissionListResponse,
    SubmissionResponse,
    UpdateSubmissionRequest,
    submission_to_response,
)
from core.services import submission_service

router = APIRouter(prefix="/submissions", tags=["Submissions"])


def _require_valid_oid(id: str) -> str:
    try:
        PydanticObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid submission ID format",
        )
    return id


# POST /submissions — create draft
@router.post("", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    body: CreateSubmissionRequest,
    user: User = Depends(get_current_user),
):
    if user.role != Role.SUBMITTER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only submitters can create submissions",
        )
    sub = await submission_service.create_submission(body, user)
    return submission_to_response(sub)


# GET /submissions/my — list caller's own submissions
# MUST be declared before /{id} to avoid "my" being captured as an ObjectId.
@router.get("/my", response_model=SubmissionListResponse)
async def list_my_submissions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    submissions, total = await submission_service.list_my_submissions(user, page, page_size)
    return SubmissionListResponse(
        submissions=[submission_to_response(s) for s in submissions],
        total=total,
        page=page,
        page_size=page_size,
    )


# GET /submissions/pending — queue for HOD / committee review
# MUST be declared before /{id}.
@router.get("/pending", response_model=List[SubmissionResponse])
async def list_pending_for_review(user: User = Depends(get_current_user)):
    if user.role not in (Role.HOD, Role.SDG_COMMITTEE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    submissions = await submission_service.list_pending_for_review(user)
    return [submission_to_response(s) for s in submissions]


# GET /submissions/{id}
@router.get("/{id}", response_model=SubmissionResponse)
async def get_submission(
    id: str,
    user: User = Depends(get_current_user),
):
    _require_valid_oid(id)
    sub = await submission_service.get_submission(id, user)
    return submission_to_response(sub)


# PATCH /submissions/{id}
@router.patch("/{id}", response_model=SubmissionResponse)
async def update_draft(
    id: str,
    body: UpdateSubmissionRequest,
    user: User = Depends(get_current_user),
):
    _require_valid_oid(id)
    sub = await submission_service.update_draft(id, body, user)
    return submission_to_response(sub)
