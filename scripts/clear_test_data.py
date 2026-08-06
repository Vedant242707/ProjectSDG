import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import settings
from models.user import User
from models.submission import Submission

async def clear_test_data():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(database=client[settings.DB_NAME], document_models=[User, Submission])

    test_emails = [
        "submitter_test@msrit.edu",
        "hod_test@msrit.edu",
        "committee_test@msrit.edu"
    ]
    
    # 1. Delete the test users
    for email in test_emails:
        user = await User.find_one(User.email == email)
        if user:
            # 2. Delete any submissions made by this user
            await Submission.find(Submission.submitter_id == user.id).delete()
            # 3. Delete the user
            await user.delete()
            print(f"Deleted user {email} and all their submissions.")
        else:
            print(f"User {email} not found.")

    client.close()
    print("Test data cleanup complete.")

if __name__ == "__main__":
    asyncio.run(clear_test_data())
