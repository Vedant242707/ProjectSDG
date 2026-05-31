from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator

from models.submission import Submission, SubmissionType
from models.workflow_event import WorkflowEvent


# ---------- Request Schemas ----------

class CreateSubmissionRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=5000)
    type: SubmissionType
    sdg_tags: List[int] = Field(..., min_length=1)
    department_id: Optional[str] = None

    @field_validator("sdg_tags")
    @classmethod
    def validate_sdg_tags(cls, v: List[int]) -> List[int]:
        for tag in v:
            if tag < 1 or tag > 17:
                raise ValueError(f"SDG tag {tag} is out of range; must be between 1 and 17")
        if len(v) != len(set(v)):
            raise ValueError("Duplicate SDG tags are not allowed")
        return sorted(set(v))


class UpdateSubmissionRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, min_length=10, max_length=5000)
    type: Optional[SubmissionType] = None
    sdg_tags: Optional[List[int]] = None

    @field_validator("sdg_tags")
    @classmethod
    def validate_sdg_tags(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        for tag in v:
            if tag < 1 or tag > 17:
                raise ValueError(f"SDG tag {tag} is out of range; must be between 1 and 17")
        if len(v) != len(set(v)):
            raise ValueError("Duplicate SDG tags are not allowed")
        return sorted(set(v))


class RejectRequest(BaseModel):
    note: str = Field(..., min_length=10, max_length=2000)


class ResubmitRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[SubmissionType] = None
    sdg_tags: Optional[List[int]] = None
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("sdg_tags")
    @classmethod
    def validate_sdg_tags(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        for tag in v:
            if tag < 1 or tag > 17:
                raise ValueError(f"SDG tag {tag} is out of range; must be between 1 and 17")
        if len(v) != len(set(v)):
            raise ValueError("Duplicate SDG tags are not allowed")
        return sorted(set(v))


class ApproveRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


# ---------- Response Schemas ----------

class SubmissionResponse(BaseModel):
    id: str = Field(..., alias="_id")
    submission_id: str
    submitter_id: str
    department_id: str
    title: str
    description: str
    type: SubmissionType
    sdg_tags: List[int]
    status: str
    attachments: List[Any]
    created_at: str
    updated_at: str

    model_config = {"populate_by_name": True}


class SubmissionListResponse(BaseModel):
    submissions: List[SubmissionResponse]
    total: int
    page: int
    page_size: int


class WorkflowEventResponse(BaseModel):
    id: str = Field(..., alias="_id")
    submission_id: str
    actor_id: str
    actor_role: str
    action: str
    from_status: str
    to_status: str
    note: Optional[str]
    timestamp: str

    model_config = {"populate_by_name": True}


# ---------- Converter Helpers ----------

def submission_to_response(sub: Submission) -> dict:
    return {
        "_id": str(sub.id),
        "submission_id": sub.submission_id or "",
        "submitter_id": str(sub.submitter_id),
        "department_id": str(sub.department_id),
        "title": sub.title,
        "description": sub.description,
        "type": sub.type,
        "sdg_tags": sub.sdg_tags,
        "status": sub.status,
        "attachments": sub.attachments,
        "created_at": sub.created_at.isoformat(),
        "updated_at": sub.updated_at.isoformat(),
    }


def workflow_event_to_response(event: WorkflowEvent) -> dict:
    return {
        "_id": str(event.id),
        "submission_id": str(event.submission_id),
        "actor_id": str(event.actor_id),
        "actor_role": event.actor_role.value,
        "action": event.action.value,
        "from_status": event.from_status.value,
        "to_status": event.to_status.value,
        "note": event.note,
        "timestamp": event.timestamp.isoformat(),
    }
