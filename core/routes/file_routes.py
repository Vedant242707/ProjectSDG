from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from auth.dependencies.auth_deps import get_current_user
from models.submission import Submission, SubmissionStatus
from models.user import User
from core.services import file_service
from core.services import submission_service

router = APIRouter(tags=["Files"])

_EDITABLE_STATUSES = {SubmissionStatus.DRAFT, SubmissionStatus.REJECTED_HOD}


async def _get_owned_submission(submission_id: str, user: User) -> Submission:
    """Load submission, verify existence, ownership, and editable status."""
    try:
        oid = PydanticObjectId(submission_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    submission = await Submission.get(oid)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if submission.submitter_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your submission")

    if submission.status not in _EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Files can only be managed on DRAFT or REJECTED_HOD submissions",
        )

    return submission


@router.post(
    "/submissions/{submission_id}/files",
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    submission_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Upload a file attachment to a submission. Max 10 MB, max 5 files, PDF/image/Word only."""
    await _get_owned_submission(submission_id, user)
    attachment = await file_service.upload_file(file, submission_id, str(user.id))
    return attachment


@router.get("/files/{object_name:path}")
async def get_download_url(
    object_name: str,
    user: User = Depends(get_current_user),
):
    """Safely proxy an attachment so internal Docker storage is never exposed to browsers."""
    submission = await Submission.find_one({"attachments.object_name": object_name})
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await submission_service.get_submission(str(submission.id), user)

    attachment = next(att for att in submission.attachments if att.get("object_name") == object_name)
    stream = file_service.get_file_object(object_name)
    filename = attachment.get("original_filename", "attachment")
    media_type = attachment.get("content_type") or "application/octet-stream"
    return StreamingResponse(
        stream.stream(32 * 1024),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
        background=BackgroundTask(stream.close),
    )


@router.delete(
    "/submissions/{submission_id}/files/{file_index}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_file(
    submission_id: str,
    file_index: int,
    user: User = Depends(get_current_user),
):
    """Remove an attachment by its zero-based index from the submission's attachments array."""
    submission = await _get_owned_submission(submission_id, user)

    attachments = list(submission.attachments)
    if file_index < 0 or file_index >= len(attachments):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File index {file_index} is out of range (0–{len(attachments) - 1})",
        )

    attachment = attachments[file_index]
    object_name = attachment.get("object_name") if isinstance(attachment, dict) else attachment

    await file_service.delete_file(object_name)

    attachments.pop(file_index)
    await Submission.get_motor_collection().update_one(
        {"_id": submission.id},
        {
            "$set": {
                "attachments": attachments,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
