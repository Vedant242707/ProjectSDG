from datetime import datetime, timezone
from typing import List
from beanie import Document, PydanticObjectId
from pydantic import Field
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
    sdg_tags: List[int] = Field(default_factory=list)
    attachments: List[str] = Field(default_factory=list)
    approved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "repository"
