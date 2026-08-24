import asyncio

from beanie import PydanticObjectId, init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from config.settings import settings
from core.celery_app import celery
from models.department import Department
from models.notification import Notification
from models.submission import Submission
from models.user import Role, User


async def _init_db() -> AsyncIOMotorClient:
    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(
        database=client[settings.DB_NAME],
        document_models=[Notification, User, Department, Submission],
    )
    return client


async def _create_notification(
    user_id,
    message: str,
    submission_id=None,
) -> Notification:
    notif = Notification(
        user_id=PydanticObjectId(user_id) if isinstance(user_id, str) else user_id,
        message=message,
        submission_id=(
            PydanticObjectId(submission_id)
            if submission_id and isinstance(submission_id, str)
            else submission_id
        ),
    )
    await notif.insert()
    return notif


@celery.task(name="notify_submission_created")
def notify_submission_created(
    submitter_id: str,
    submission_id_str: str,
    submission_human_id: str,
) -> None:
    """Notify submitter that their submission was submitted to HOD."""
    async def _run():
        client = await _init_db()
        try:
            await _create_notification(
                submitter_id,
                f"Your submission {submission_human_id} has been submitted to your HOD for review.",
                submission_id_str,
            )
        finally:
            client.close()

    asyncio.run(_run())


@celery.task(name="notify_hod_new_submission")
def notify_hod_new_submission(
    department_id: str,
    submitter_name: str,
    submission_id_str: str,
    submission_human_id: str,
) -> None:
    """Notify the HOD that a new submission is awaiting review."""
    async def _run():
        client = await _init_db()
        try:
            dept = await Department.get(PydanticObjectId(department_id))
            if dept and dept.hod_user_id:
                await _create_notification(
                    dept.hod_user_id,
                    f"New submission {submission_human_id} from {submitter_name} is awaiting your review.",
                    submission_id_str,
                )
        finally:
            client.close()

    asyncio.run(_run())


@celery.task(name="notify_hod_approved")
def notify_hod_approved(
    submitter_id: str,
    submission_id_str: str,
    submission_human_id: str,
) -> None:
    """Notify submitter of HOD approval; notify all committee members."""
    async def _run():
        client = await _init_db()
        try:
            await _create_notification(
                submitter_id,
                f"Your submission {submission_human_id} has been approved by the HOD and sent to the SDG Committee.",
                submission_id_str,
            )
            committee_members = await User.find(User.role == Role.SDG_COMMITTEE).to_list()
            for member in committee_members:
                await _create_notification(
                    member.id,
                    f"Submission {submission_human_id} has been approved by HOD and is awaiting your review.",
                    submission_id_str,
                )
        finally:
            client.close()

    asyncio.run(_run())


@celery.task(name="notify_hod_resubmitted_to_committee")
def notify_hod_resubmitted_to_committee(
    submitter_id: str,
    submission_id_str: str,
    submission_human_id: str,
) -> None:
    """Notify submitter and committee when HOD returns a committee-rejected item."""
    async def _run():
        client = await _init_db()
        try:
            await _create_notification(
                submitter_id,
                f"Your submission {submission_human_id} has been revised by the HOD and resubmitted to the SDG Committee.",
                submission_id_str,
            )
            committee_members = await User.find(User.role == Role.SDG_COMMITTEE).to_list()
            for member in committee_members:
                await _create_notification(
                    member.id,
                    f"Submission {submission_human_id} has been resubmitted by the HOD and is awaiting your review.",
                    submission_id_str,
                )
        finally:
            client.close()

    asyncio.run(_run())


@celery.task(name="notify_hod_rejected")
def notify_hod_rejected(
    submitter_id: str,
    submission_id_str: str,
    submission_human_id: str,
    note: str,
) -> None:
    """Notify submitter that HOD rejected their submission."""
    async def _run():
        client = await _init_db()
        try:
            await _create_notification(
                submitter_id,
                f"Your submission {submission_human_id} was returned by the HOD. Reason: {note}. Please revise and resubmit.",
                submission_id_str,
            )
        finally:
            client.close()

    asyncio.run(_run())


@celery.task(name="notify_committee_approved")
def notify_committee_approved(
    submitter_id: str,
    department_id: str,
    submission_id_str: str,
    submission_human_id: str,
) -> None:
    """Notify submitter and HOD that committee gave final approval."""
    async def _run():
        client = await _init_db()
        try:
            await _create_notification(
                submitter_id,
                f"Congratulations! Your submission {submission_human_id} has been approved and added to the SDG Repository.",
                submission_id_str,
            )
            dept = await Department.get(PydanticObjectId(department_id))
            if dept and dept.hod_user_id:
                await _create_notification(
                    dept.hod_user_id,
                    f"Submission {submission_human_id} has been approved by the SDG Committee and added to the Repository.",
                    submission_id_str,
                )
        finally:
            client.close()

    asyncio.run(_run())


@celery.task(name="notify_committee_rejected")
def notify_committee_rejected(
    department_id: str,
    submission_id_str: str,
    submission_human_id: str,
    note: str,
) -> None:
    """Notify HOD that committee rejected (returns to HOD, not submitter)."""
    async def _run():
        client = await _init_db()
        try:
            dept = await Department.get(PydanticObjectId(department_id))
            if dept and dept.hod_user_id:
                await _create_notification(
                    dept.hod_user_id,
                    f"Submission {submission_human_id} was returned by the SDG Committee. Reason: {note}. Please review.",
                    submission_id_str,
                )
        finally:
            client.close()

    asyncio.run(_run())


@celery.task(name="notify_resubmitted")
def notify_resubmitted(
    target_user_id: str,
    submission_id_str: str,
    submission_human_id: str,
    resubmitted_by: str,
) -> None:
    """Notify the reviewer that a submission was resubmitted."""
    async def _run():
        client = await _init_db()
        try:
            await _create_notification(
                target_user_id,
                f"Submission {submission_human_id} has been resubmitted by {resubmitted_by} and is awaiting your review.",
                submission_id_str,
            )
        finally:
            client.close()

    asyncio.run(_run())
