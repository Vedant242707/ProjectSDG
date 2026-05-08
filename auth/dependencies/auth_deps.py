from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, ExpiredSignatureError, jwt
from beanie import PydanticObjectId

from config.settings import settings
from models.user import User, Role

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Decode JWT, validate expiry, fetch full User from MongoDB.
    This is the handoff dependency injected into every protected route.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exception

    user = await User.get(PydanticObjectId(user_id))
    if user is None:
        raise credentials_exception
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Raises 403 if the authenticated user is not an ADMIN."""
    if user.role != Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


async def require_hod(user: User = Depends(get_current_user)) -> User:
    """Raises 403 if the authenticated user is not an HOD."""
    if user.role != Role.HOD:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HOD access required",
        )
    return user


async def require_committee(user: User = Depends(get_current_user)) -> User:
    """Raises 403 if the authenticated user is not SDG_COMMITTEE."""
    if user.role != Role.SDG_COMMITTEE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SDG Committee access required",
        )
    return user
