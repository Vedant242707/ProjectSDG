from typing import Optional
from beanie import Document, PydanticObjectId


class Department(Document):
    name: str
    code: str
    hod_user_id: Optional[PydanticObjectId] = None

    class Settings:
        name = "departments"
