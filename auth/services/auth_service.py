import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

from jose import jwt
from passlib.context import CryptContext

from config.settings import settings
from models.user import User
from models.refresh_token import RefreshToken

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # OAuth-created accounts intentionally have no password hash.  Treat an
    # attempted password login as invalid credentials rather than returning a
    # server error from passlib.
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (ValueError, TypeError):
        return False


def create_access_token(user: User) -> str:
    """
    Build JWT with the exact shared contract shape:
    {
        "user_id": "<ObjectId as string>",
        "email": "user@msrit.edu",
        "role": "HOD",
        "department_ids": ["<dept_id_1>", "<dept_id_2>"],
        "exp": 1234567890
    }
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "department_ids": [str(d) for d in user.department_ids],
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def generate_refresh_token() -> str:
    """Generate a raw UUID refresh token."""
    return str(uuid.uuid4())


def hash_token(raw_token: str) -> str:
    """SHA-256 hash a raw token for DB storage. Never store raw tokens."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def store_refresh_token(user_id, raw_token: str) -> RefreshToken:
    """Hash the raw token and persist to refresh_tokens collection."""
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    refresh_doc = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        revoked=False,
    )
    await refresh_doc.insert()
    return refresh_doc


async def rotate_refresh_token(old_token_doc: RefreshToken, user: User) -> tuple:
    """
    Token rotation: revoke old token, issue new pair.
    Returns (new_access_token, new_raw_refresh_token).
    """
    # Revoke old
    old_token_doc.revoked = True
    await old_token_doc.save()

    # Issue new
    new_access = create_access_token(user)
    new_raw_refresh = generate_refresh_token()
    await store_refresh_token(user.id, new_raw_refresh)

    return new_access, new_raw_refresh
