from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import HTTPException, status
from pymongo import ReturnDocument

from models.department import Department
from models.submission import Submission, SubmissionStatus
from models.submission_counter import SubmissionCounter
from models.user import Role, User
from core.schemas.submission_schemas import CreateSubmissionRequest, UpdateSubmissionRequest


async def create_submission(body: CreateSubmissionRequest, user: User) -> Submission:
    # Resolve department_id
    if body.department_id is not None:
        try:
            dept_oid = PydanticObjectId(body.department_id)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid department_id")
        if dept_oid not in user.department_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not belong to that department")
    else:
        if len(user.department_ids) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No department assigned")
        if len(user.department_ids) > 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must specify department_id")
        dept_oid = user.department_ids[0]

    dept = await Department.get(dept_oid)
    if dept is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")

    # Atomically increment counter and generate submission_id
    collection = SubmissionCounter.get_motor_collection()
    year = datetime.now(timezone.utc).year
    result = await collection.find_one_and_update(
        {"department_code": dept.code},
        {"$inc": {"last_seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = result["last_seq"]
    submission_id = f"SDG-{year}-{dept.code}-{seq:05d}"

    submission = Submission(
        submission_id=submission_id,
        submitter_id=user.id,
        department_id=dept_oid,
        title=body.title,
        description=body.description,
        type=body.type,
        sdg_tags=body.sdg_tags,
        status=SubmissionStatus.DRAFT,
        attachments=[],
    )
    await submission.insert()
    return submission


async def get_submission(submission_id: str, user: User) -> Submission:
    try:
        oid = PydanticObjectId(submission_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    sub = await Submission.get(oid)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if user.role == Role.ADMIN:
        return sub

    if user.role == Role.SUBMITTER:
        if sub.submitter_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        return sub

    if user.role == Role.HOD:
        if sub.department_id not in user.department_ids or sub.status == SubmissionStatus.DRAFT:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        return sub

    if user.role == Role.SDG_COMMITTEE:
        visible_statuses = {
            SubmissionStatus.PENDING_COMMITTEE,
            SubmissionStatus.APPROVED,
            SubmissionStatus.REJECTED_COMM,
        }
        if sub.status not in visible_statuses:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        return sub

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")


async def list_my_submissions(
    user: User,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Submission], int]:
    query = Submission.find(Submission.submitter_id == user.id)
    total = await query.count()
    submissions = (
        await query.sort(-Submission.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return submissions, total


async def list_pending_for_review(user: User) -> list[Submission]:
    if user.role == Role.HOD:
        return (
            await Submission.find(
                {
                    "department_id": {"$in": user.department_ids},
                    "status": {"$in": [SubmissionStatus.PENDING_HOD, SubmissionStatus.REJECTED_COMM]},
                }
            )
            .sort(+Submission.created_at)
            .to_list()
        )

    if user.role == Role.SDG_COMMITTEE:
        return (
            await Submission.find(Submission.status == SubmissionStatus.PENDING_COMMITTEE)
            .sort(+Submission.created_at)
            .to_list()
        )

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def update_draft(
    submission_id: str,
    body: UpdateSubmissionRequest,
    user: User,
) -> Submission:
    try:
        oid = PydanticObjectId(submission_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    sub = await Submission.get(oid)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if sub.submitter_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your submission")

    editable_statuses = {SubmissionStatus.DRAFT, SubmissionStatus.REJECTED_HOD}
    if sub.status not in editable_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit in current status",
        )

    if body.title is not None:
        sub.title = body.title
    if body.description is not None:
        sub.description = body.description
    if body.type is not None:
        sub.type = body.type
    if body.sdg_tags is not None:
        sub.sdg_tags = body.sdg_tags

    sub.updated_at = datetime.now(timezone.utc)
    await sub.save()
    return sub
