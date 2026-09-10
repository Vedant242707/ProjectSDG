from enum import Enum
from datetime import datetime, timezone
from typing import List, Optional
from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel, ASCENDING


class Role(str, Enum):
    SUBMITTER = "SUBMITTER"
    HOD = "HOD"
    SDG_COMMITTEE = "SDG_COMMITTEE"
    ADMIN = "ADMIN"


class User(Document):
    college_id: str
    full_name: str = ""
    email: str
    hashed_password: str
    role: Role = Role.SUBMITTER
    department_ids: List[PydanticObjectId] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("college_id", ASCENDING)], unique=True),
        ]
