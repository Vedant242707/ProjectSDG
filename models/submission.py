from enum import Enum
from datetime import datetime, timezone
from typing import List, Optional
from beanie import Document, PydanticObjectId
from pydantic import Field


class SubmissionType(str, Enum):
    PROJECT = "PROJECT"
    RESEARCH = "RESEARCH"
    ACHIEVEMENT = "ACHIEVEMENT"
    EVENT = "EVENT"


class SubmissionStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_HOD = "PENDING_HOD"
    PENDING_COMMITTEE = "PENDING_COMMITTEE"
    APPROVED = "APPROVED"
    REJECTED_HOD = "REJECTED_HOD"
    REJECTED_COMM = "REJECTED_COMM"
    WITHDRAWN = "WITHDRAWN"


class Submission(Document):
    submission_id: Optional[str] = None
    submitter_id: PydanticObjectId
    department_id: PydanticObjectId
    title: str
    description: str
    type: SubmissionType
    sdg_tags: List[int] = Field(default_factory=list)
    status: SubmissionStatus = SubmissionStatus.DRAFT
    attachments: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "submissions"
