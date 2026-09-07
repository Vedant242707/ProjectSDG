from datetime import datetime, timezone

from beanie import Document, Indexed
from pydantic import Field


class EmailVerification(Document):
    """Short-lived, hashed OTP state for a pending registration."""

    email: Indexed(str, unique=True)
    otp_hash: str
    expires_at: datetime
    attempts: int = 0
    registration_token: str | None = None
    verified_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "email_verifications"
