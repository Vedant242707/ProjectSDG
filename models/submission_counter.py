from beanie import Document
from pymongo import IndexModel, ASCENDING


class SubmissionCounter(Document):
    """
    Used for generating sequential submission IDs per department.
    Each department_code gets its own counter.
    """
    department_code: str
    last_seq: int = 0

    class Settings:
        name = "submission_counters"
        indexes = [
            IndexModel([("department_code", ASCENDING)], unique=True),
        ]
