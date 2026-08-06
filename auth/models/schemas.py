from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from models.user import Role


# ---------- Auth Schemas ----------

class RegisterRequest(BaseModel):
    college_id: str = Field(..., min_length=1)
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)
    department_id: Optional[str] = None  # user-selected at registration


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str = Field(..., alias="_id")
    college_id: str
    email: str
    role: Role
    department_ids: List[str]
    is_active: bool
    created_at: str

    model_config = {"populate_by_name": True}


class MessageResponse(BaseModel):
    message: str


# ---------- Admin Schemas ----------

class UpdateRoleRequest(BaseModel):
    role: Role
    department_ids: List[str] = Field(default_factory=list)


class CreateDepartmentRequest(BaseModel):
    name: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)


class UpdateDepartmentRequest(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None


class DepartmentResponse(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    code: str
    hod_user_id: Optional[str] = None

    model_config = {"populate_by_name": True}
