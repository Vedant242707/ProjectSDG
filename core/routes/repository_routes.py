from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies.auth_deps import get_current_user
from models.user import User
from core.schemas.repository_schemas import (
    RepositoryEntryResponse,
    RepositorySearchResponse,
    repository_entry_to_response,
)
from core.services import repository_service

router = APIRouter(prefix="/repository", tags=["Repository"])


@router.get("", response_model=RepositorySearchResponse)
async def search_repository(
    sdg: Optional[int] = Query(default=None, ge=1, le=17),
    department_id: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    academic_year: Optional[str] = Query(default=None),
    keyword: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    entries, total = await repository_service.search_repository(
        sdg_tag=sdg,
        department_id=department_id,
        submission_type=type,
        from_date=from_date,
        to_date=to_date,
        academic_year=academic_year,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )
    return RepositorySearchResponse(
        entries=[repository_entry_to_response(e) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{entry_id}", response_model=RepositoryEntryResponse)
async def get_repository_entry(
    entry_id: str,
    user: User = Depends(get_current_user),
):
    entry = await repository_service.get_repository_entry(entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository entry not found")
    return repository_entry_to_response(entry)
