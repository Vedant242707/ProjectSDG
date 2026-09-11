import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from beanie import PydanticObjectId

from models.user import User, Role
from models.department import Department
from models.notification import Notification
from models.submission import Submission, SubmissionStatus
from models.repository import Repository
from auth.models.schemas import (
    UpdateRoleRequest,
    CreateDepartmentRequest,
    UpdateDepartmentRequest,
    UserResponse,
    DepartmentResponse,
    MessageResponse,
)
from auth.dependencies.auth_deps import require_admin

router = APIRouter(prefix="/admin", tags=["Admin"])


def _user_to_response(user: User) -> dict:
    """Convert a User document to a response dict, excluding hashed_password."""
    return {
        "_id": str(user.id),
        "college_id": user.college_id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "department_ids": [str(d) for d in user.department_ids],
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
    }


def _dept_to_response(dept: Department) -> dict:
    """Convert a Department document to a response dict."""
    return {
        "_id": str(dept.id),
        "name": dept.name,
        "code": dept.code,
        "hod_user_id": str(dept.hod_user_id) if dept.hod_user_id else None,
    }


# ---------- User Management ----------

@router.get("/users", response_model=List[UserResponse])
async def search_users(
    search: Optional[str] = Query(default=None),
    admin: User = Depends(require_admin),
):
    if not search or search.strip() == "":
        users = await User.find_all().to_list()
    else:
        pattern = re.escape(search.strip())
        users = await User.find(
            {
                "$or": [
                    {"college_id": {"$regex": pattern, "$options": "i"}},
                    {"full_name": {"$regex": pattern, "$options": "i"}},
                    {"email": {"$regex": pattern, "$options": "i"}},
                ]
            }
        ).to_list()

    return [_user_to_response(u) for u in users]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    body: UpdateRoleRequest,
    admin: User = Depends(require_admin),
):
    # Validate user exists
    user = await User.get(PydanticObjectId(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Validate role-specific department requirements
    if body.role == Role.SDG_COMMITTEE and body.department_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SDG_COMMITTEE role cannot be assigned to departments",
        )

    # Validate all department IDs exist
    new_dept_oids = []
    for dept_id_str in body.department_ids:
        dept = await Department.get(PydanticObjectId(dept_id_str))
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Department {dept_id_str} does not exist",
            )
        new_dept_oids.append(PydanticObjectId(dept_id_str))

    # Department.hod_user_id is the routing source of truth. Read every
    # reference before changing the user so stale records are also repaired.
    assigned_hod_departments = await Department.find(
        Department.hod_user_id == user.id
    ).to_list()
    new_dept_ids = set(body.department_ids)

    # Update user
    user.role = body.role
    user.department_ids = new_dept_oids
    await user.save()

    # If new role is HOD, update department HOD references
    if body.role == Role.HOD:
        # Set this user as HOD for new departments
        for dept_id_str in new_dept_ids:
            dept = await Department.get(PydanticObjectId(dept_id_str))
            if dept:
                # If there's a previous HOD, downgrade them
                if dept.hod_user_id and dept.hod_user_id != user.id:
                    prev_hod = await User.get(dept.hod_user_id)
                    if prev_hod:
                        # Remove this department from prev_hod
                        prev_hod.department_ids = [d for d in prev_hod.department_ids if str(d) != dept_id_str]
                        # If no depts left, downgrade role
                        if not prev_hod.department_ids:
                            prev_hod.role = Role.SUBMITTER
                        await prev_hod.save()
                
                dept.hod_user_id = user.id
                await dept.save()

        # Clear every previously assigned department the admin did not keep.
        # This uses the department records rather than only user.department_ids,
        # so a legacy/stale HOD reference cannot remain in the panel or routing.
        for dept in assigned_hod_departments:
            if str(dept.id) not in new_dept_ids and dept.hod_user_id == user.id:
                dept.hod_user_id = None
                await dept.save()
    else:
        # Removing an HOD role must also remove every department reference.
        for dept in assigned_hod_departments:
            if dept.hod_user_id == user.id:
                dept.hod_user_id = None
                await dept.save()
    
    # Final check: If user role was HOD but now has no departments, downgrade to SUBMITTER
    # (Except if we just explicitly set it to HOD in this request)
    if user.role == Role.HOD and not user.department_ids:
        user.role = Role.SUBMITTER
        await user.save()

    # Create notification
    notification = Notification(
        user_id=user.id,
        message=f"Your role has been updated to {body.role.value}.",
        submission_id=None,
    )
    await notification.insert()

    return _user_to_response(user)


# ---------- Department Management ----------

@router.get("/project-report/filters")
async def project_report_filters(admin: User = Depends(require_admin)):
    """Return the available academic years for the administrator's project report."""
    years = await Repository.get_motor_collection().distinct("academic_year")
    return {"academic_years": sorted((year for year in years if year), reverse=True)}


@router.get("/project-report")
async def project_report(
    department_id: Optional[str] = Query(default=None),
    academic_year: Optional[str] = Query(default=None),
    admin: User = Depends(require_admin),
):
    """
    Return approved projects for the administrator's department/year report.
    This deliberately reads from the immutable repository, so drafts, review
    records, and rejected submissions are never included in an exported report.
    """
    query = {}
    if department_id:
        try:
            query["department_id"] = PydanticObjectId(department_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid department ID",
            )
    if academic_year:
        query["academic_year"] = academic_year

    projects = await Repository.find(query).sort("-approved_at").to_list()
    return {
        "projects": [
            {
                "submission_id": project.submission_id,
                "title": project.title,
                "department_name": project.department_name,
                "department_code": project.department_code,
                "academic_year": project.academic_year,
                "type": project.type.value,
                "sdg_tags": project.sdg_tags,
                "approved_at": project.approved_at.isoformat(),
            }
            for project in projects
        ]
    }


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: CreateDepartmentRequest,
    admin: User = Depends(require_admin),
):
    # Check code uniqueness
    existing = await Department.find_one(Department.code == body.code.strip().upper())
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Department code already exists",
        )

    dept = Department(
        name=body.name.strip(),
        code=body.code.strip().upper(),
    )
    await dept.insert()
    return _dept_to_response(dept)


@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(admin: User = Depends(require_admin)):
    depts = await Department.find_all().to_list()
    return [_dept_to_response(d) for d in depts]


@router.patch("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    body: UpdateDepartmentRequest,
    admin: User = Depends(require_admin),
):
    dept = await Department.get(PydanticObjectId(dept_id))
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    if body.name is not None:
        dept.name = body.name.strip()
    if body.code is not None:
        # Check code uniqueness if changing
        existing = await Department.find_one(
            Department.code == body.code.strip().upper(),
            Department.id != dept.id,
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Department code already exists",
            )
        dept.code = body.code.strip().upper()

    await dept.save()
    return _dept_to_response(dept)


@router.delete("/departments/{dept_id}", response_model=MessageResponse)
async def delete_department(
    dept_id: str,
    admin: User = Depends(require_admin),
):
    dept = await Department.get(PydanticObjectId(dept_id))
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    # Check for active submissions in this department
    active_submission = await Submission.find_one(
        Submission.department_id == dept.id,
        Submission.status != SubmissionStatus.WITHDRAWN,
    )
    if active_submission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete department with active submissions",
        )

    await dept.delete()
    return MessageResponse(message="Department deleted")
