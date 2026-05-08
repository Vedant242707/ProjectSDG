from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from beanie import PydanticObjectId

from config.settings import settings
from models.user import User, Role
from models.refresh_token import RefreshToken
from auth.models.schemas import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    LogoutRequest,
    TokenResponse,
    UserResponse,
    MessageResponse,
)
from auth.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    generate_refresh_token,
    hash_token,
    store_refresh_token,
    rotate_refresh_token,
)
from auth.dependencies.auth_deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _user_to_response(user: User) -> dict:
    """Convert a User document to a response dict, excluding hashed_password."""
    return {
        "_id": str(user.id),
        "college_id": user.college_id,
        "email": user.email,
        "role": user.role,
        "department_ids": [str(d) for d in user.department_ids],
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
    }


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    # Validate email domain
    domain = body.email.strip().split("@")[-1].lower()
    if domain != settings.COLLEGE_EMAIL_DOMAIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only @{settings.COLLEGE_EMAIL_DOMAIN} email addresses are allowed",
        )

    # Validate password match
    if body.password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match",
        )

    # Check unique college_id
    existing_cid = await User.find_one(User.college_id == body.college_id)
    if existing_cid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="College ID is already registered",
        )

    # Check unique email
    existing_email = await User.find_one(User.email == body.email.strip().lower())
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    # Create user
    user = User(
        college_id=body.college_id,
        email=body.email.strip().lower(),
        hashed_password=hash_password(body.password),
        role=Role.SUBMITTER,
        department_ids=[],
    )
    await user.insert()
    return _user_to_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Find user by email (using username field from form)
    user = await User.find_one(User.email == form_data.username.strip().lower())
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Verify password
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Issue tokens
    access_token = create_access_token(user)
    raw_refresh = generate_refresh_token()
    await store_refresh_token(user.id, raw_refresh)

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        token_type="bearer",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest):
    # Hash the incoming raw token and look it up
    token_hash = hash_token(body.refresh_token)
    token_doc = await RefreshToken.find_one(RefreshToken.token_hash == token_hash)

    if not token_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if token_doc.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    if token_doc.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    # Fetch the user
    user = await User.get(token_doc.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Token rotation
    new_access, new_raw_refresh = await rotate_refresh_token(token_doc, user)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_raw_refresh,
        token_type="bearer",
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(body: LogoutRequest, user: User = Depends(get_current_user)):
    token_hash = hash_token(body.refresh_token)
    token_doc = await RefreshToken.find_one(RefreshToken.token_hash == token_hash)

    if token_doc:
        token_doc.revoked = True
        await token_doc.save()

    return MessageResponse(message="Logged out successfully")
