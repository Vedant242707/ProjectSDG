import re
from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from models.department import Department
from models.repository import Repository
from models.submission import Submission


def get_academic_year() -> str:
    """Return current academic year string like '2025-2026'. Academic year runs June–May."""
    now = datetime.now(timezone.utc)
    if now.month >= 6:
        return f"{now.year}-{now.year + 1}"
    return f"{now.year - 1}-{now.year}"


async def finalize_submission(submission: Submission) -> Repository:
    """
    Write-once snapshot of an approved submission into the Repository collection.
    Idempotent: returns the existing entry if one was already created for this submission_id.
    """
    existing = await Repository.find_one(
        Repository.submission_id == submission.submission_id
    )
    if existing:
        return existing

    dept = await Department.get(submission.department_id)
    type_value = submission.type.value if hasattr(submission.type, "value") else str(submission.type)
    now = datetime.now(timezone.utc)

    entry = Repository(
        submission_id=submission.submission_id,
        original_submission_id=submission.id,
        submitter_id=submission.submitter_id,
        department_id=submission.department_id,
        title=submission.title,
        description=submission.description,
        type=submission.type,
        submission_type=type_value,
        sdg_tags=list(submission.sdg_tags),
        attachments=list(submission.attachments),
        department_code=dept.code if dept else "UNKNOWN",
        department_name=dept.name if dept else "Unknown Department",
        academic_year=get_academic_year(),
        approved_at=now,
        created_at=now,
    )
    await entry.insert()
    return entry


async def get_repository_entry(entry_id: str) -> Optional[Repository]:
    try:
        oid = PydanticObjectId(entry_id)
    except Exception:
        return None
    return await Repository.get(oid)


async def search_repository(
    sdg_tag: Optional[int] = None,
    department_id: Optional[str] = None,
    submission_type: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    academic_year: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Repository], int]:
    """Search approved repository entries. All filters are optional and composable."""
    conditions = []

    if sdg_tag is not None:
        conditions.append(Repository.sdg_tags == sdg_tag)

    if department_id:
        try:
            conditions.append(Repository.department_id == PydanticObjectId(department_id))
        except Exception:
            pass

    if submission_type:
        conditions.append(Repository.submission_type == submission_type)

    if academic_year:
        conditions.append(Repository.academic_year == academic_year)

    if from_date:
        dt = datetime.fromisoformat(from_date)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        conditions.append(Repository.approved_at >= dt)

    if to_date:
        dt = datetime.fromisoformat(to_date)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        conditions.append(Repository.approved_at <= dt)

    if keyword:
        pattern = re.escape(keyword)
        conditions.append({
            "$or": [
                {"title": {"$regex": pattern, "$options": "i"}},
                {"description": {"$regex": pattern, "$options": "i"}},
            ]
        })

    query = Repository.find(*conditions) if conditions else Repository.find()
    total = await query.count()
    entries = (
        await query
        .sort(-Repository.approved_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return entries, total
