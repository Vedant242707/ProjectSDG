import io
import logging
import uuid
from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId
from fastapi import HTTPException, UploadFile, status
from minio import Minio
from minio.error import S3Error

from config.settings import settings

logger = logging.getLogger(__name__)

_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
_MAX_FILES_PER_SUBMISSION = 5


def get_minio_client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


async def ensure_bucket() -> None:
    """Create the bucket if it doesn't exist. Called once at app startup."""
    client = get_minio_client()
    if not client.bucket_exists(settings.MINIO_BUCKET):
        client.make_bucket(settings.MINIO_BUCKET)
        logger.info("Created MinIO bucket: %s", settings.MINIO_BUCKET)
    else:
        logger.info("MinIO bucket ready: %s", settings.MINIO_BUCKET)


async def upload_file(
    file: UploadFile,
    submission_id: str,
    user_id: str,
) -> dict:
    """
    Upload a file to MinIO and append its metadata to the submission's attachments array.
    Returns the attachment metadata dict.
    """
    from models.submission import Submission

    # Read content first so we can validate size without leaving the cursor mid-stream
    content = await file.read()

    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum 10 MB per file.",
        )

    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "").strip()
    allowed_extensions = {"pdf", "jpg", "jpeg", "png", "gif", "doc", "docx"}
    
    if file.content_type not in _ALLOWED_CONTENT_TYPES and ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{file.content_type}' or extension '.{ext}' is not allowed. Only PDF, JPEG, PNG, GIF, and Word files are permitted.",
        )

    submission = await Submission.get(PydanticObjectId(submission_id))
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if len(submission.attachments) >= _MAX_FILES_PER_SUBMISSION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {_MAX_FILES_PER_SUBMISSION} files per submission.",
        )

    ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
    object_name = f"{submission_id}/{uuid.uuid4().hex}.{ext}"

    client = get_minio_client()
    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(content),
        length=len(content),
        content_type=file.content_type,
    )

    attachment = {
        "object_name": object_name,
        "original_filename": file.filename or object_name,
        "content_type": file.content_type,
        "size": len(content),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    await Submission.get_motor_collection().update_one(
        {"_id": submission.id},
        {
            "$push": {"attachments": attachment},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )

    return attachment


async def get_download_url(object_name: str) -> str:
    """Generate a pre-signed GET URL for secure file download. Expires in 1 hour."""
    client = get_minio_client()
    try:
        url = client.presigned_get_object(
            settings.MINIO_BUCKET,
            object_name,
            expires=timedelta(hours=1),
        )
        return url
    except S3Error as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {exc}",
        )


async def delete_file(object_name: str) -> None:
    """Delete a file from MinIO storage."""
    client = get_minio_client()
    try:
        client.remove_object(settings.MINIO_BUCKET, object_name)
    except S3Error as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {exc}",
        )
