"""Stable local demo accounts created whenever the application starts."""

from auth.services.auth_service import hash_password
from config.settings import settings
from models.department import Department
from models.user import Role, User


_TEST_DEPARTMENT_CODE = "TEST"
_TEST_ACCOUNTS = (
    {
        "college_id": "TESTSUB001",
        "email": "submitter.test@msrit.edu",
        "password": "Testing123!",
        "role": Role.SUBMITTER,
    },
    {
        "college_id": "TESTHOD001",
        "email": "hod.test@msrit.edu",
        "password": "Testing123!",
        "role": Role.HOD,
    },
    {
        "college_id": "TESTCOM001",
        "email": "committee.test@msrit.edu",
        "password": "Testing123!",
        "role": Role.SDG_COMMITTEE,
    },
)


async def _upsert_user(
    *, college_id: str, email: str, password: str, role: Role, department_ids: list
) -> User:
    """Repair a demo account by either email or college ID without duplicates."""
    user = await User.find_one(
        {"$or": [{"email": email}, {"college_id": college_id}]}
    )
    if user is None:
        user = User(
            college_id=college_id,
            email=email,
            hashed_password=hash_password(password),
            role=role,
            department_ids=department_ids,
            is_active=True,
        )
        await user.insert()
        return user

    user.college_id = college_id
    user.email = email
    user.hashed_password = hash_password(password)
    user.role = role
    user.department_ids = department_ids
    user.is_active = True
    await user.save()
    return user


async def ensure_demo_accounts() -> None:
    """Ensure the local demo department, accounts, passwords, and HOD mapping exist."""
    department = await Department.find_one(Department.code == _TEST_DEPARTMENT_CODE)
    if department is None:
        department = Department(
            name="Workflow Test Department",
            code=_TEST_DEPARTMENT_CODE,
        )
        await department.insert()

    hod = None
    for account in _TEST_ACCOUNTS:
        department_ids = [] if account["role"] == Role.SDG_COMMITTEE else [department.id]
        user = await _upsert_user(**account, department_ids=department_ids)
        if account["role"] == Role.HOD:
            hod = user

    if hod is not None and department.hod_user_id != hod.id:
        department.hod_user_id = hod.id
        await department.save()

    await _upsert_user(
        college_id=settings.ADMIN_COLLEGE_ID,
        email=settings.ADMIN_EMAIL.lower(),
        password=settings.ADMIN_PASSWORD,
        role=Role.ADMIN,
        department_ids=[],
    )
