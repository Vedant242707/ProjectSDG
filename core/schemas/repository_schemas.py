from typing import List, Optional

from pydantic import BaseModel, Field

from models.repository import Repository


class RepositoryEntryResponse(BaseModel):
    id: str = Field(..., alias="_id")
    submission_id: str
    title: str
    description: str
    submission_type: str
    sdg_tags: List[int]
    department_id: str
    department_code: str
    department_name: str
    submitter_type: Optional[str] = None
    approved_at: str
    academic_year: str
    created_at: str

    model_config = {"populate_by_name": True}


class RepositorySearchResponse(BaseModel):
    entries: List[RepositoryEntryResponse]
    total: int
    page: int
    page_size: int


def repository_entry_to_response(entry: Repository) -> dict:
    submission_type = entry.submission_type or (
        entry.type.value if hasattr(entry.type, "value") else str(entry.type)
    )
    return {
        "_id": str(entry.id),
        "submission_id": entry.submission_id,
        "title": entry.title,
        "description": entry.description,
        "submission_type": submission_type,
        "sdg_tags": entry.sdg_tags,
        "department_id": str(entry.department_id),
        "department_code": entry.department_code,
        "department_name": entry.department_name,
        "submitter_type": None,
        "approved_at": entry.approved_at.isoformat(),
        "academic_year": entry.academic_year,
        "created_at": entry.created_at.isoformat(),
    }
