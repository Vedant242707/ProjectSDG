from datetime import datetime, timezone
from typing import List
from urllib.parse import urlencode, quote

import httpx
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from config.settings import settings
from models.department import Department
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

    # Optionally assign the department the user selected during registration
    if body.department_id:
        try:
            dept_oid = PydanticObjectId(body.department_id)
            dept = await Department.get(dept_oid)
            if dept:
                user.department_ids = [dept_oid]
                await user.save()
        except Exception:
            pass  # invalid ID — silently ignore, user can update later

    return _user_to_response(user)


# ─── Public department list (used by registration form, no auth required) ────────

@router.get("/departments")
async def list_departments_public() -> List[dict]:
    """Public endpoint — returns all departments so the registration form can show a dropdown."""
    depts = await Department.find_all().to_list()
    return [{"_id": str(d.id), "name": d.name, "code": d.code} for d in depts]


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


# ─── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/google")
async def google_oauth_start():
    """
    Redirect the browser to Google's OAuth 2.0 consent screen.
    No auth required — this is the entry point for Google login.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server.",
        )

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    google_auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return RedirectResponse(url=google_auth_url)


@router.get("/google/callback")
async def google_oauth_callback(code: str = None, error: str = None):
    """
    Google redirects here after the user grants (or denies) access.
    - Validates the @msrit.edu domain server-side.
    - Finds or creates the user.
    - Issues the same JWT as the regular /auth/login endpoint.
    - Redirects to the frontend with tokens in the query string.
    """
    frontend_login_url = f"{settings.FRONTEND_URL}/login"

    # User denied access or Google returned an error
    if error or not code:
        redirect_url = f"{frontend_login_url}?error={quote(error or 'google_denied')}"
        return RedirectResponse(url=redirect_url)

    # Exchange authorization code for tokens
    try:
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
            token_data = token_response.json()
    except Exception:
        redirect_url = f"{frontend_login_url}?error={quote('Failed to contact Google. Please try again.')}"
        return RedirectResponse(url=redirect_url)

    if "id_token" not in token_data:
        redirect_url = f"{frontend_login_url}?error={quote('Google did not return a valid token.')}"
        return RedirectResponse(url=redirect_url)

    # Verify the ID token and extract claims (server-side validation)
    try:
        id_info = google_id_token.verify_oauth2_token(
            token_data["id_token"],
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception:
        redirect_url = f"{frontend_login_url}?error={quote('Google token verification failed.')}"
        return RedirectResponse(url=redirect_url)

    google_email: str = id_info.get("email", "").strip().lower()
    email_verified: bool = id_info.get("email_verified", False)

    # Server-side @msrit.edu domain check
    if not email_verified or not google_email.endswith(f"@{settings.COLLEGE_EMAIL_DOMAIN}"):
        redirect_url = (
            f"{frontend_login_url}?error="
            + quote(f"Only @{settings.COLLEGE_EMAIL_DOMAIN} accounts are allowed.")
        )
        return RedirectResponse(url=redirect_url)

    # Find existing user by email, or create a new one
    user = await User.find_one(User.email == google_email)

    if not user:
        # Derive college_id from email prefix; handle potential uniqueness conflicts
        email_prefix = google_email.split("@")[0]
        college_id_candidate = email_prefix

        existing_cid = await User.find_one(User.college_id == college_id_candidate)
        if existing_cid:
            # Suffix with a short unique fragment to avoid collision
            import uuid
            college_id_candidate = f"{email_prefix[:8]}_{uuid.uuid4().hex[:6]}"

        user = User(
            college_id=college_id_candidate,
            email=google_email,
            # Empty string — not a valid bcrypt hash, so password login is blocked for OAuth users
            hashed_password="",
            role=Role.SUBMITTER,
            department_ids=[],
        )
        await user.insert()

    # Issue internal JWT (same structure as /auth/login)
    access_token = create_access_token(user)
    raw_refresh = generate_refresh_token()
    await store_refresh_token(user.id, raw_refresh)

    # Redirect to frontend login page with tokens as query params
    # The frontend picks these up on mount and stores them in localStorage
    redirect_url = (
        f"{settings.FRONTEND_URL}/login"
        f"?access_token={quote(access_token)}"
        f"&refresh_token={quote(raw_refresh)}"
        f"&role={quote(user.role.value)}"
    )
    return RedirectResponse(url=redirect_url)
