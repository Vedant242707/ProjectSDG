import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from passlib.context import CryptContext

from config.settings import settings
from models.user import User, Role

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed_admin():
    """
    Idempotent admin seed script.
    Creates the admin account if it doesn't already exist.
    Safe to run multiple times.
    """
    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(database=client[settings.DB_NAME], document_models=[User])

    # Check if admin already exists
    existing = await User.find_one(User.email == settings.ADMIN_EMAIL.lower())
    if existing:
        print("Admin already exists, skipping")
        client.close()
        return

    # Create admin user
    admin = User(
        college_id=settings.ADMIN_COLLEGE_ID,
        email=settings.ADMIN_EMAIL.lower(),
        hashed_password=pwd_context.hash(settings.ADMIN_PASSWORD),
        role=Role.ADMIN,
        department_ids=[],
    )
    await admin.insert()
    print("Admin account created successfully")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_admin())
