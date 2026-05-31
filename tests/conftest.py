import uuid
from unittest.mock import patch

import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from models.user import User, Role
from models.department import Department
from models.submission import Submission, SubmissionStatus, SubmissionType
from models.workflow_event import WorkflowEvent
from models.notification import Notification
from models.repository import Repository
from models.submission_counter import SubmissionCounter
from models.refresh_token import RefreshToken


_CELERY_TASK_PATHS = [
    "core.services.workflow_service.notify_submission_created",
    "core.services.workflow_service.notify_hod_new_submission",
    "core.services.workflow_service.notify_hod_approved",
    "core.services.workflow_service.notify_committee_approved",
    "core.services.workflow_service.notify_hod_rejected",
    "core.services.workflow_service.notify_committee_rejected",
]


@pytest.fixture(autouse=True)
def mock_celery_tasks():
    """Prevent any test from hitting a real Celery broker.

    Tests that need to assert on specific task calls patch the same paths
    inside their own with-block, which overrides this fixture's mock for
    the duration of that block.
    """
    with patch(_CELERY_TASK_PATHS[0]), patch(_CELERY_TASK_PATHS[1]), \
         patch(_CELERY_TASK_PATHS[2]), patch(_CELERY_TASK_PATHS[3]), \
         patch(_CELERY_TASK_PATHS[4]), patch(_CELERY_TASK_PATHS[5]):
        yield


@pytest_asyncio.fixture(scope="function")
async def test_db():
    db_name = f"sdg_test_{uuid.uuid4().hex[:8]}"
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client[db_name]
    await init_beanie(
        database=db,
        document_models=[
            User,
            RefreshToken,
            Department,
            Submission,
            WorkflowEvent,
            Notification,
            Repository,
            SubmissionCounter,
        ],
    )
    yield db
    await client.drop_database(db_name)
    client.close()


@pytest_asyncio.fixture
async def seed_data(test_db):
    cs_dept = Department(name="Computer Science", code="CS")
    me_dept = Department(name="Mechanical Engineering", code="ME")
    await cs_dept.insert()
    await me_dept.insert()

    submitter = User(
        college_id="1MS22CS001",
        email="student@msrit.edu",
        hashed_password="test_hash",
        role=Role.SUBMITTER,
        department_ids=[cs_dept.id],
    )
    hod_cs = User(
        college_id="HOD_CS",
        email="hod.cs@msrit.edu",
        hashed_password="test_hash",
        role=Role.HOD,
        department_ids=[cs_dept.id],
    )
    hod_me = User(
        college_id="HOD_ME",
        email="hod.me@msrit.edu",
        hashed_password="test_hash",
        role=Role.HOD,
        department_ids=[me_dept.id],
    )
    committee = User(
        college_id="COMM001",
        email="committee@msrit.edu",
        hashed_password="test_hash",
        role=Role.SDG_COMMITTEE,
        department_ids=[],
    )
    admin = User(
        college_id="ADMIN001",
        email="admin@msrit.edu",
        hashed_password="test_hash",
        role=Role.ADMIN,
        department_ids=[],
    )

    await submitter.insert()
    await hod_cs.insert()
    await hod_me.insert()
    await committee.insert()
    await admin.insert()

    cs_dept.hod_user_id = hod_cs.id
    await cs_dept.save()
    me_dept.hod_user_id = hod_me.id
    await me_dept.save()

    return {
        "cs_dept": cs_dept,
        "me_dept": me_dept,
        "submitter": submitter,
        "hod_cs": hod_cs,
        "hod_me": hod_me,
        "committee": committee,
        "admin": admin,
    }


@pytest_asyncio.fixture
async def draft_submission(seed_data):
    submission = Submission(
        submission_id="SDG-2026-CS-00001",
        submitter_id=seed_data["submitter"].id,
        department_id=seed_data["cs_dept"].id,
        title="Test Project",
        description="A test project for SDG testing purposes",
        type=SubmissionType.PROJECT,
        sdg_tags=[4, 7],
        status=SubmissionStatus.DRAFT,
        attachments=[],
    )
    await submission.insert()
    return submission
