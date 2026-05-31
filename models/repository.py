from datetime import datetime, timezone
from typing import Any, List, Optional
from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, IndexModel
from models.submission import SubmissionType


class Repository(Document):
    """
    READ ONLY after write — no updates, no deletes.
    Stores approved submissions as permanent records.
    """
    submission_id: str
    original_submission_id: PydanticObjectId
    submitter_id: PydanticObjectId
    department_id: PydanticObjectId
    title: str
    description: str
    type: SubmissionType
    # Denormalized string copy so search doesn't need a join
    submission_type: str = ""
    sdg_tags: List[int] = Field(default_factory=list)
    attachments: List[Any] = Field(default_factory=list)
    # Denormalized department metadata for fast search display
    department_code: str = ""
    department_name: str = ""
    academic_year: str = ""
    approved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "repository"
        indexes = [
            IndexModel([("submission_id", ASCENDING)], unique=True),
            IndexModel([("sdg_tags", ASCENDING)]),
            IndexModel([("department_id", ASCENDING)]),
            IndexModel([("academic_year", ASCENDING)]),
        ]
