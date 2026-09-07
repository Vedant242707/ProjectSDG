"""Email OTP creation and delivery for password registrations."""

import asyncio
import hashlib
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from config.settings import settings
from models.email_verification import EmailVerification


def _hash(value: str) -> str:
    return hashlib.sha256(f"{settings.JWT_SECRET}:{value}".encode()).hexdigest()


async def create_and_send_otp(email: str) -> None:
    """Replace any old OTP for email and send a fresh six-digit code."""
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("Email verification is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")

    otp = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.now(timezone.utc)
    verification = await EmailVerification.find_one(EmailVerification.email == email)
    if verification is None:
        verification = EmailVerification(email=email, otp_hash=_hash(otp), expires_at=now + timedelta(minutes=10))
        await verification.insert()
    else:
        verification.otp_hash = _hash(otp)
        verification.expires_at = now + timedelta(minutes=10)
        verification.attempts = 0
        verification.registration_token = None
        verification.verified_at = None
        await verification.save()

    await asyncio.to_thread(_send_email, email, otp)


def _send_email(recipient: str, otp: str) -> None:
    message = EmailMessage()
    message["Subject"] = "Your SDG Portal verification code"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(f"Your SDG Portal verification code is: {otp}\n\nIt expires in 10 minutes. Do not share this code with anyone.")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(message)


async def verify_otp(email: str, otp: str) -> str | None:
    verification = await EmailVerification.find_one(EmailVerification.email == email)
    now = datetime.now(timezone.utc)
    if (
        verification is None
        or verification.expires_at.replace(tzinfo=timezone.utc) < now
        or verification.attempts >= 5
        or not secrets.compare_digest(verification.otp_hash, _hash(otp))
    ):
        if verification is not None:
            verification.attempts += 1
            await verification.save()
        return None

    token = secrets.token_urlsafe(32)
    verification.registration_token = _hash(token)
    verification.verified_at = now
    await verification.save()
    return token


async def consume_registration_token(email: str, token: str) -> bool:
    verification = await EmailVerification.find_one(EmailVerification.email == email)
    if (
        verification is None
        or verification.verified_at is None
        or verification.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc)
        or not verification.registration_token
        or not secrets.compare_digest(verification.registration_token, _hash(token))
    ):
        return False
    await verification.delete()
    return True
