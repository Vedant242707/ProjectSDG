import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from passlib.context import CryptContext
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import settings
from models.user import User, Role

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_test_users():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(database=client[settings.DB_NAME], document_models=[User])

    test_users = [
        {
            "college_id": "submitter_test",
            "email": "submitter_test@msrit.edu",
            "password": "password123",
            "role": Role.SUBMITTER
        },
        {
            "college_id": "hod_test",
            "email": "hod_test@msrit.edu",
            "password": "password123",
            "role": Role.HOD
        },
        {
            "college_id": "committee_test",
            "email": "committee_test@msrit.edu",
            "password": "password123",
            "role": Role.SDG_COMMITTEE
        }
    ]

    for tu in test_users:
        existing = await User.find_one(User.email == tu["email"])
        if existing:
            print(f"User {tu['email']} already exists, skipping")
            continue
        
        user = User(
            college_id=tu["college_id"],
            email=tu["email"],
            hashed_password=pwd_context.hash(tu["password"]),
            role=tu["role"],
            department_ids=[],
        )
        await user.insert()
        print(f"Created {tu['role']} account: {tu['email']} / {tu['password']}")

    client.close()

if __name__ == "__main__":
    asyncio.run(seed_test_users())
