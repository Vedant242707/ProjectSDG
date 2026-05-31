from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from config.settings import settings
from models.user import User
from models.refresh_token import RefreshToken
from models.department import Department
from models.submission import Submission
from models.workflow_event import WorkflowEvent
from models.notification import Notification
from models.repository import Repository
from models.submission_counter import SubmissionCounter
from auth.routes.auth_routes import router as auth_router
from auth.routes.admin_routes import router as admin_router
from core.routes.submission_routes import router as submission_router
from core.routes.workflow_routes import router as workflow_router
from core.routes.notification_routes import router as notification_router
from core.routes.ws_routes import router as ws_router
from core.routes.repository_routes import router as repository_router
from core.routes.dashboard_routes import router as dashboard_router
from core.routes.file_routes import router as file_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: connect to MongoDB and initialize Beanie
    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(
        database=client[settings.DB_NAME],
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
    print(f"Connected to MongoDB: {settings.DB_NAME}")

    # Ensure MinIO bucket exists — non-fatal if MinIO is not available yet
    try:
        from core.services.file_service import ensure_bucket
        await ensure_bucket()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("MinIO not available at startup: %s", exc)

    yield
    # Shutdown: close MongoDB connection
    client.close()
    print("MongoDB connection closed")


app = FastAPI(
    title="SDG Workflow Management System",
    description="A workflow management system for Sustainable Development Goals submissions",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(submission_router)
app.include_router(workflow_router)
app.include_router(notification_router)
app.include_router(ws_router)
app.include_router(repository_router)
app.include_router(dashboard_router)
app.include_router(file_router)


@app.get("/", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "SDG Workflow Management System"}
