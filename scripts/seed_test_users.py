import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from passlib.context import CryptContext
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import settings
from models.user import User, Role
from models.department import Department

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_test_users():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(database=client[settings.DB_NAME], document_models=[User, Department])

    # All workflow roles need a common department: a submitter creates work in
    # it and its HOD receives the review queue.  Keep this idempotent so the
    # script is safe to run whenever a local test database is reset.
    department = await Department.find_one(Department.code == "TEST")
    if not department:
        department = Department(name="Workflow Test Department", code="TEST")
        await department.insert()

    test_users = [
        {
            "college_id": "TESTSUB001",
            "email": "submitter.test@msrit.edu",
            "password": "Testing123!",
            "role": Role.SUBMITTER,
            "department_ids": [department.id],
        },
        {
            "college_id": "TESTHOD001",
            "email": "hod.test@msrit.edu",
            "password": "Testing123!",
            "role": Role.HOD,
            "department_ids": [department.id],
        },
        {
            "college_id": "TESTCOM001",
            "email": "committee.test@msrit.edu",
            "password": "Testing123!",
            "role": Role.SDG_COMMITTEE,
            "department_ids": [],
        }
    ]

    for tu in test_users:
        existing = await User.find_one(User.email == tu["email"])
        if existing:
            user = existing
            user.college_id = tu["college_id"]
            user.hashed_password = pwd_context.hash(tu["password"])
            user.role = tu["role"]
            user.department_ids = tu["department_ids"]
            await user.save()
            print(f"Updated {tu['role'].value} account: {tu['email']} / {tu['password']}")
        else:
            user = User(
                college_id=tu["college_id"],
                email=tu["email"],
                hashed_password=pwd_context.hash(tu["password"]),
                role=tu["role"],
                department_ids=tu["department_ids"],
            )
            await user.insert()
            print(f"Created {tu['role'].value} account: {tu['email']} / {tu['password']}")

        if tu["role"] == Role.HOD:
            department.hod_user_id = user.id
            await department.save()

    client.close()

if __name__ == "__main__":
    asyncio.run(seed_test_users())
