from enum import Enum
from datetime import datetime, timezone
from typing import Optional
from beanie import Document, PydanticObjectId
from pydantic import Field
from models.user import Role
from models.submission import SubmissionStatus


class WorkflowAction(str, Enum):
    SUBMIT = "SUBMIT"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    RESUBMIT = "RESUBMIT"
    WITHDRAW = "WITHDRAW"


class WorkflowEvent(Document):
    """
    APPEND ONLY — never update or delete any document in this collection.
    """
    submission_id: PydanticObjectId
    actor_id: PydanticObjectId
    actor_role: Role
    action: WorkflowAction
    from_status: SubmissionStatus
    to_status: SubmissionStatus
    note: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "workflow_events"
