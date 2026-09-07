# SDG Workflow Management System

A full-stack web application for managing Sustainable Development Goals (SDG) submissions at **MSRIT** (M.S. Ramaiah Institute of Technology). Faculty and students submit SDG-aligned work (projects, research, achievements, events) through a multi-stage approval workflow with HOD and SDG Committee review, real-time notifications, and a public analytics dashboard.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [System Architecture Diagram](#system-architecture-diagram)
- [Workflow State Machine](#workflow-state-machine)
- [Data Models](#data-models)
- [API Reference](#api-reference)
- [Frontend Pages](#frontend-pages)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Testing](#testing)

---

## Features

### Submission Management
- Create submissions tagged with one or more of the 17 UN SDGs
- Four submission types: **Project**, **Research**, **Achievement**, **Event**
- Atomic submission ID generation (`SDG-2026-CSE-00042`)
- File attachments via MinIO (PDF, images, Word docs; 10MB limit, 5 files max)
- Save as draft, edit, and resubmit after rejection

### Multi-Stage Approval Workflow
- **Two-tier review**: HOD approval followed by SDG Committee approval
- Pure-function state machine with 9 legal transitions and role enforcement
- Optimistic concurrency control prevents race conditions on simultaneous approvals
- Mandatory rejection notes (min 10 characters) with optional approval notes
- Withdrawal support from DRAFT, PENDING_HOD, and PENDING_COMMITTEE states
- Complete audit trail via append-only `workflow_events` collection

### Notifications & Real-Time Updates
- Async notification dispatch via Celery workers (7 event types)
- WebSocket live tracking per submission (status pushed on every transition)
- Notification bell with unread badge (30-second polling)
- Mark individual or bulk mark-all-as-read

### Public Dashboard
- Aggregate SDG analytics with zero PII exposure
- Per-SDG breakdown: approved count, in-review count, current-year count
- Department-level breakdown and site-wide totals
- Server-Sent Events (SSE) for live dashboard updates every 30 seconds
- Redis-cached aggregation (30-second TTL)

### Repository
- Approved submissions auto-finalized into an immutable repository
- Idempotent finalization (duplicate calls return existing entry)
- Composable search: SDG tag, department, type, date range, keyword
- Academic year calculation (June-May cycle)

### Admin Panel
- User search by college ID or email
- Role assignment (SUBMITTER, HOD, SDG_COMMITTEE, ADMIN)
- Department CRUD with automatic HOD reference management
- Protection against deleting departments with active submissions

### Authentication & Security
- College email domain restriction (`@msrit.edu`)
- JWT access tokens (30-min expiry) with refresh token rotation
- Bcrypt password hashing
- Role-based route guards on both backend and frontend

---

## Architecture

```
                  ┌─────────────────────────────────────────────────────────────┐
                  │                         NGINX                              │
                  │              (reverse proxy + SPA host)                     │
                  │   /api/* → backend    /ws/* → WebSocket    /* → React SPA  │
                  └────────┬────────────────┬──────────────────┬───────────────┘
                           │                │                  │
               ┌───────────▼────────┐  ┌────▼──────┐   ┌──────▼──────┐
               │    FastAPI         │  │ WebSocket  │   │  React SPA  │
               │  (REST + SSE)     │  │  Server    │   │  (Vite)     │
               │  Port 8000        │  │            │   │  Port 80    │
               └──┬──────┬─────┬───┘  └─────┬──────┘   └─────────────┘
                  │      │     │             │
         ┌────────▼┐  ┌──▼──┐  ┌▼─────────┐  │
         │ MongoDB │  │Redis│  │  MinIO   │  │
         │  :27017 │  │:6379│  │ :9000    │  │
         └─────────┘  └──┬──┘  └──────────┘  │
                         │                   │
                    ┌────▼───────────────────▼──┐
                    │   Redis Pub/Sub           │
                    │ (WS fan-out + cache)      │
                    └────┬─────────────────────┘
                         │
                    ┌────▼──────────────┐
                    │   Celery Worker   │
                    │ (async notifs)    │
                    └───────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 6, Axios, Lucide Icons |
| **Backend** | Python 3.12, FastAPI, Uvicorn, Pydantic v2 |
| **ODM** | Beanie (async MongoDB ODM built on Motor) |
| **Database** | MongoDB 7 |
| **Cache / Pub-Sub** | Redis 7 (hiredis) |
| **Task Queue** | Celery 5 with Redis broker |
| **Object Storage** | MinIO (S3-compatible) |
| **Auth** | JWT (python-jose) + bcrypt + refresh token rotation |
| **Real-Time** | WebSocket (native FastAPI) + SSE (sse-starlette) |
| **Reverse Proxy** | NGINX |
| **Containerization** | Docker + Docker Compose |

---

## Workflow State Machine

The workflow engine is a **pure function** — zero side effects, zero DB calls — making it independently testable.

### State Diagram

```
                            ┌──────────────────────────────────────────────────────┐
                            │                                                      │
                            ▼                                                      │
  ┌───────────┐  SUBMIT   ┌─────────────┐  APPROVE   ┌───────────────────┐  APPROVE  ┌──────────┐
  │           │──────────▶│             │───────────▶│                   │──────────▶│          │
  │   DRAFT   │           │ PENDING_HOD │            │ PENDING_COMMITTEE │           │ APPROVED │
  │           │           │             │            │                   │           │(terminal)│
  └─────┬─────┘          └──────┬──────┘            └────────┬──────────┘           └──────────┘
        │                       │                            │
        │ WITHDRAW              │ REJECT                     │ REJECT
        │                       ▼                            ▼
        │                ┌──────────────┐             ┌──────────────┐
        │                │ REJECTED_HOD │             │REJECTED_COMM │
        │                └──────┬───────┘             └──────┬───────┘
        │                       │                            │
        │                       │ RESUBMIT                   │ RESUBMIT
        │                       │ (by Submitter)             │ (by HOD)
        │                       ▼                            ▼
        │                ┌─────────────┐             ┌───────────────────┐
        │                │ PENDING_HOD │             │ PENDING_COMMITTEE │
        │                └─────────────┘             └───────────────────┘
        │
        ▼
  ┌───────────┐
  │ WITHDRAWN │
  │ (terminal)│
  └───────────┘
```

### Transition Table

| Current Status | Action | New Status | Allowed Roles |
|---|---|---|---|
| DRAFT | SUBMIT | PENDING_HOD | SUBMITTER |
| DRAFT | WITHDRAW | WITHDRAWN | SUBMITTER |
| PENDING_HOD | APPROVE | PENDING_COMMITTEE | HOD |
| PENDING_HOD | REJECT | REJECTED_HOD | HOD |
| PENDING_HOD | WITHDRAW | WITHDRAWN | SUBMITTER |
| PENDING_COMMITTEE | APPROVE | APPROVED | SDG_COMMITTEE |
| PENDING_COMMITTEE | REJECT | REJECTED_COMM | SDG_COMMITTEE |
| REJECTED_HOD | RESUBMIT | PENDING_HOD | SUBMITTER |
| REJECTED_COMM | RESUBMIT | PENDING_COMMITTEE | HOD |

**Terminal states**: `APPROVED` and `WITHDRAWN` accept no further transitions.

---

## Data Models

### Entity Relationship Diagram

```
┌──────────────────┐       ┌────────────────────┐       ┌──────────────────────┐
│      User        │       │    Department       │       │   Submission         │
├──────────────────┤       ├────────────────────┤       ├──────────────────────┤
│ _id              │       │ _id                │       │ _id                  │
│ college_id (uniq)│       │ name               │◀──┐   │ submission_id (uniq) │
│ email (uniq)     │       │ code (uniq)        │   │   │ submitter_id ───────▶│ User
│ hashed_password  │       │ hod_user_id ──────▶│User   │ department_id ──────▶│ Department
│ role (enum)      │       └────────────────────┘   │   │ title                │
│ department_ids[] ├───────────────────────────────┘   │ description          │
│ is_active        │                                    │ type (enum)          │
│ created_at       │       ┌────────────────────┐       │ sdg_tags [1..17]     │
└──────────────────┘       │  WorkflowEvent     │       │ status (enum)        │
                           ├────────────────────┤       │ attachments [dict]   │
                           │ _id                │       │ created_at           │
┌──────────────────┐       │ submission_id ────▶│       │ updated_at           │
│   Notification   │       │ actor_id ─────────▶│User  └──────────────────────┘
├──────────────────┤       │ actor_role         │               │
│ _id              │       │ action (enum)      │               │
│ user_id ────────▶│User   │ from_status        │               │
│ message          │       │ to_status          │       ┌───────▼──────────────┐
│ submission_id ──▶│       │ note               │       │   Repository         │
│ read (bool)      │       │ timestamp          │       ├──────────────────────┤
│ created_at       │       └────────────────────┘       │ _id                  │
└──────────────────┘                                    │ submission_id (uniq) │
                                                        │ original_submission_id│
┌──────────────────┐                                    │ title, description   │
│SubmissionCounter │                                    │ department_code/name │
├──────────────────┤                                    │ sdg_tags, type       │
│ department_id    │                                    │ academic_year        │
│ year             │                                    │ approved_at          │
│ counter          │                                    └──────────────────────┘
└──────────────────┘
```

### Roles

| Role | Capabilities |
|------|-------------|
| `SUBMITTER` | Create, edit, submit, withdraw, resubmit (after HOD rejection) |
| `HOD` | Approve/reject at HOD stage, resubmit (after Committee rejection), department-scoped |
| `SDG_COMMITTEE` | Approve/reject at Committee stage, cross-department view |
| `ADMIN` | User management, role assignment, department CRUD |

---

## API Reference

### Authentication (`/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register with college email | No |
| POST | `/auth/login` | OAuth2 password login, returns JWT + refresh token | No |
| POST | `/auth/refresh` | Rotate refresh token | No |
| POST | `/auth/logout` | Revoke refresh token | Yes |

### Admin (`/admin`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/admin/users?search=` | Search users by college ID or email | ADMIN |
| PATCH | `/admin/users/{id}/role` | Update user role + departments | ADMIN |
| POST | `/admin/departments` | Create department | ADMIN |
| GET | `/admin/departments` | List all departments | ADMIN |
| PATCH | `/admin/departments/{id}` | Update department name/code | ADMIN |
| DELETE | `/admin/departments/{id}` | Delete department (if no active submissions) | ADMIN |

### Submissions (`/submissions`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/submissions` | Create a draft submission | SUBMITTER |
| GET | `/submissions/my?page=&page_size=` | List caller's submissions (paginated) | Any |
| GET | `/submissions/pending` | Review queue for HOD/Committee | HOD, SDG_COMMITTEE |
| GET | `/submissions/{id}` | Get submission detail | Any (role-scoped) |
| PATCH | `/submissions/{id}` | Edit draft or rejected submission | SUBMITTER |

### Workflow Actions (`/submissions`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/submissions/{id}/submit` | Move DRAFT to PENDING_HOD | SUBMITTER |
| POST | `/submissions/{id}/approve` | Advance to next stage | HOD, SDG_COMMITTEE |
| POST | `/submissions/{id}/reject` | Reject with mandatory note | HOD, SDG_COMMITTEE |
| POST | `/submissions/{id}/resubmit` | Resubmit after rejection | SUBMITTER, HOD |
| POST | `/submissions/{id}/withdraw` | Withdraw submission | SUBMITTER |
| GET | `/submissions/{id}/timeline` | Chronological audit trail | Any |

### File Attachments

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/submissions/{id}/files` | Upload file (10MB max, PDF/image/Word) | SUBMITTER |
| GET | `/files/{path}` | Get pre-signed download URL (1hr expiry) | Any |
| DELETE | `/submissions/{id}/files/{index}` | Remove attachment by index | SUBMITTER |

### Notifications (`/notifications`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/notifications?page=&page_size=` | List notifications with unread count | Any |
| GET | `/notifications/unread-count` | Badge count for polling | Any |
| PATCH | `/notifications/{id}/read` | Mark single notification as read | Any |
| PATCH | `/notifications/read-all` | Bulk mark all as read | Any |

### Repository (`/repository`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/repository?sdg=&department_id=&type=&keyword=&page=` | Search approved entries | Any |
| GET | `/repository/{id}` | Get single repository entry | Any |

### Dashboard (`/dashboard`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/dashboard/summary` | Cached aggregate dashboard | **Public** |
| GET | `/dashboard/stream` | SSE live updates (every 30s) | **Public** |
| GET | `/dashboard/sdg/{n}` | Stats for a single SDG (1-17) | **Public** |

### WebSocket

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| WS | `/ws/submissions/{id}?token=JWT` | Live status updates for a submission |

---

## Frontend Pages

| Route | Page | Access | Description |
|-------|------|--------|-------------|
| `/` | Dashboard | Public | 17 SDG cards with live counters, department breakdown |
| `/login` | Login | Public | Email + password form |
| `/register` | Register | Public | College ID + email domain validation |
| `/submissions` | My Submissions | Authenticated | Paginated table with status badges and SDG chips |
| `/submissions/new` | Create Submission | SUBMITTER | Form with SDG picker, file upload, save-as-draft |
| `/submissions/:id` | Submission Detail | Authenticated | Full info, vertical timeline, WebSocket live updates |
| `/review` | Review Queue | HOD, SDG_COMMITTEE | Approve/reject with note modals |
| `/notifications` | Notifications | Authenticated | Notification list with mark-read, deep-link to submission |
| `/admin` | Admin Panel | ADMIN | User search, role assignment, department management |

### Component Architecture

```
App.jsx
├── AuthProvider (context)
├── ToastProvider (context)
├── BrowserRouter
│   ├── / ──────────────────── Dashboard (public)
│   ├── /login ─────────────── Login
│   ├── /register ──────────── Register
│   └── Layout (sidebar + header)
│       ├── /submissions ───── MySubmissions
│       ├── /submissions/new ─ CreateSubmission
│       │                      └── SDGTagPicker
│       ├── /submissions/:id ─ SubmissionDetail
│       ├── /review ────────── ReviewQueue
│       ├── /notifications ─── Notifications
│       └── /admin ─────────── AdminPanel
│
├── NotificationBell (header component, 30s polling)
├── ProtectedRoute (role-based guard)
├── Spinner (loading state)
└── Toast (notifications)
```

---

## Project Structure

```
ProjectSDG/
├── main.py                          # FastAPI app entry point + lifespan
├── config/
│   └── settings.py                  # Pydantic settings (env-driven)
│
├── auth/                            # Phase 1 — Authentication
│   ├── dependencies/
│   │   └── auth_deps.py             # get_current_user, require_admin
│   ├── models/
│   │   └── schemas.py               # Register, Login, Token schemas
│   ├── routes/
│   │   ├── auth_routes.py           # /auth endpoints
│   │   └── admin_routes.py          # /admin endpoints
│   └── services/
│       └── auth_service.py          # JWT, bcrypt, token rotation
│
├── core/                            # Phase 2-4 — Core business logic
│   ├── workflow/
│   │   └── state_machine.py         # Pure transition function
│   ├── schemas/
│   │   ├── submission_schemas.py    # Request/response models
│   │   ├── notification_schemas.py
│   │   └── repository_schemas.py
│   ├── services/
│   │   ├── submission_service.py    # CRUD + atomic ID generation
│   │   ├── workflow_service.py      # Orchestration + concurrency control
│   │   ├── notification_service.py  # Notification CRUD
│   │   ├── dashboard_service.py     # MongoDB aggregation + Redis cache
│   │   ├── repository_service.py    # Auto-finalization + search
│   │   └── file_service.py          # MinIO upload/download/delete
│   ├── routes/
│   │   ├── submission_routes.py     # /submissions CRUD
│   │   ├── workflow_routes.py       # /submissions/{id}/action
│   │   ├── notification_routes.py   # /notifications
│   │   ├── ws_routes.py             # WebSocket /ws/submissions/{id}
│   │   ├── repository_routes.py     # /repository
│   │   ├── dashboard_routes.py      # /dashboard (public)
│   │   └── file_routes.py           # File upload/download
│   └── notifications/
│       └── tasks.py                 # 7 Celery async tasks
│
├── models/                          # Beanie document models
│   ├── user.py                      # User + Role enum
│   ├── department.py                # Department
│   ├── submission.py                # Submission + Status/Type enums
│   ├── workflow_event.py            # Append-only audit log
│   ├── notification.py              # Notification
│   ├── repository.py                # Immutable approved records
│   ├── submission_counter.py        # Atomic ID counter
│   └── refresh_token.py             # Refresh token storage
│
├── frontend/                        # React SPA
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── Dockerfile                   # Multi-stage: node build → nginx
│   └── src/
│       ├── main.jsx                 # Entry point
│       ├── App.jsx                  # Router + providers
│       ├── api/
│       │   └── client.js            # Axios + JWT interceptor
│       ├── context/
│       │   └── AuthContext.jsx       # Auth state + token management
│       ├── components/
│       │   ├── Layout.jsx           # Sidebar + header shell
│       │   ├── ProtectedRoute.jsx   # Role-based route guard
│       │   ├── SDGTagPicker.jsx     # 17-SDG multi-select
│       │   ├── NotificationBell.jsx # Unread badge + polling
│       │   ├── Spinner.jsx
│       │   └── Toast.jsx
│       └── pages/
│           ├── Dashboard.jsx        # Public SDG analytics
│           ├── Login.jsx
│           ├── Register.jsx
│           ├── MySubmissions.jsx
│           ├── CreateSubmission.jsx
│           ├── SubmissionDetail.jsx  # Timeline + WebSocket
│           ├── ReviewQueue.jsx      # Approve/reject modals
│           ├── Notifications.jsx
│           ├── AdminPanel.jsx
│           └── NotFound.jsx
│
├── tests/                           # 71 tests
│   ├── conftest.py                  # DB fixtures, Celery mocks
│   ├── test_state_machine.py        # 20+ pure function tests
│   ├── test_workflow_integration.py # DB integration tests
│   ├── test_notifications.py        # Service + dispatch tests
│   ├── test_repository.py           # Finalization + search tests
│   └── test_dashboard.py            # Aggregation + endpoint tests
│
├── scripts/
│   ├── deploy.sh                    # Build + deploy + seed
│   └── seed_admin.py                # Seed admin user
│
├── docker-compose.yml               # Full stack orchestration
├── Dockerfile                       # Backend image (Python 3.12)
├── nginx.conf                       # Reverse proxy config
├── requirements.txt                 # Python dependencies
└── pytest.ini                       # Test configuration
```

---

## Getting Started

### Prerequisites

- **Python 3.12+**
- **Node.js 18+** and npm
- **MongoDB 7** (or Docker)
- **Redis 7** (or Docker)
- **MinIO** (or Docker)

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/Vedant242707/ProjectSDG.git
cd ProjectSDG

# Create environment file
cp .env.example .env
# Edit .env with your values

# Start all services
docker compose up --build

# Seed admin user (in a separate terminal)
docker compose exec backend python scripts/seed_admin.py
```

The app will be available at `http://localhost`.

### Option 2: Local Development

```bash
# ── Backend ──
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start MongoDB, Redis, MinIO (via Docker or locally)
docker compose up -d mongodb redis minio

# Run backend
uvicorn main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A core.celery_app worker --loglevel=info

# Seed admin user
python scripts/seed_admin.py

# Seed the submitter, HOD, and committee accounts used to test the full workflow
python scripts/seed_test_users.py
```

```bash
# ── Frontend ──
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:5173` with API proxy to `:8000`.

### Workflow test accounts

The application automatically creates (or repairs) the following local test
accounts every time Docker starts. The submitter and HOD are assigned to the
same **Workflow Test Department**, so the workflow is ready immediately:

| Role | Email | Password |
|------|-------|----------|
| Submitter | `submitter.test@msrit.edu` | `Testing123!` |
| HOD | `hod.test@msrit.edu` | `Testing123!` |
| SDG Committee | `committee.test@msrit.edu` | `Testing123!` |

Use them in this order: create and submit as the submitter, approve or reject
as the HOD, then approve or reject as the committee account.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `DB_NAME` | `sdg_workflow` | Database name |
| `JWT_SECRET` | — | Secret key for JWT signing (min 32 chars) |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token TTL |
| `COLLEGE_EMAIL_DOMAIN` | `msrit.edu` | Allowed email domain for registration |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS origins (comma-separated) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO server address |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `sdg-attachments` | MinIO bucket name |
| `MINIO_SECURE` | `false` | Use HTTPS for MinIO |
| `ADMIN_EMAIL` | `admin@msrit.edu` | Seed admin email |
| `ADMIN_PASSWORD` | — | Seed admin password |
| `ADMIN_COLLEGE_ID` | `ADMIN001` | Seed admin college ID |
| `GOOGLE_CLIENT_ID` | — | OAuth client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | — | OAuth client secret from Google Cloud |
| `GOOGLE_REDIRECT_URI` | `http://localhost/api/auth/google/callback` | Must exactly match the URI registered in Google Cloud |
| `FRONTEND_URL` | `http://localhost` | Public URL of the React application |
| `SMTP_HOST` | — | SMTP server used to deliver registration OTP emails |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USERNAME` | — | SMTP account username |
| `SMTP_PASSWORD` | — | SMTP app password or provider credential |
| `SMTP_FROM_EMAIL` | — | Sender address shown to registrants |
| `SMTP_USE_TLS` | `true` | Enable STARTTLS for SMTP |

### Google sign-in setup

The sign-in page includes **Sign in with Google**. Before using it locally, add
`http://localhost/api/auth/google/callback` as an authorised redirect URI for
the OAuth client in Google Cloud Console, then set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in `.env`. The server verifies the Google ID token and
allows only verified `@msrit.edu` addresses. Password sign-in, registration,
token refresh, and Google sign-in all enforce the same domain rule.

To move the application to a different URL later, update `FRONTEND_URL` and
`GOOGLE_REDIRECT_URI` in `.env`, then add the exact new callback URI to the
same Google OAuth client's authorised redirect URIs. Keep `GOOGLE_CLIENT_ID`
and `GOOGLE_CLIENT_SECRET` in `.env` only; never commit them.

### Email OTP setup

Password registration requires a six-digit email code that expires in ten
minutes. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`,
`SMTP_FROM_EMAIL`, and `SMTP_USE_TLS` in the untracked `.env` file. For Gmail,
use a dedicated sender account and a Google App Password; for the college
deployment, replace those values with the college SMTP provider’s credentials.
The code never needs to change when ownership changes.

---

## Deployment

### Production with Docker Compose

```bash
# Build and deploy
./scripts/deploy.sh
```

This script:
1. Builds all Docker images (backend, frontend/nginx)
2. Starts services with health checks and dependency ordering
3. Seeds the admin user

### Service Architecture in Production

```
Port 80 (NGINX)
  ├── Static React SPA (served directly)
  ├── /api/* → FastAPI backend (port 8000, 2 workers)
  ├── /ws/*  → WebSocket (upgrade headers)
  └── /api/dashboard/stream → SSE (buffering disabled)

Internal services:
  ├── MongoDB :27017 (persistent volume)
  ├── Redis :6379 (cache + pub/sub + Celery broker)
  ├── MinIO :9000 (file storage, persistent volume)
  ├── Celery Worker (async notification dispatch)
  └── Celery Beat (scheduled tasks)
```

---

## Testing

```bash
# Run all tests
pytest

# Run specific test modules
pytest tests/test_state_machine.py        # Workflow state machine (pure function)
pytest tests/test_workflow_integration.py  # DB integration tests
pytest tests/test_notifications.py         # Notification service + dispatch
pytest tests/test_repository.py            # Repository finalization + search
pytest tests/test_dashboard.py             # Dashboard aggregation

# Run with verbose output
pytest -v
```

### Test Coverage Summary

| Module | Tests | Coverage |
|--------|-------|----------|
| State Machine | 20+ | All 9 transitions, illegal transitions, terminal states |
| Workflow Integration | ~15 | Full approval cycle, HOD scoping, race conditions (409), rejection flows |
| Notifications | ~10 | Create, list, mark-read, Celery dispatch mocking, WebSocket auth |
| Repository | 9 | Finalization, idempotency, search filters, pagination, academic year |
| Dashboard | 18 | Empty state, SDG counts, department breakdown, public endpoint |
| **Total** | **71** | |

---

## UN Sustainable Development Goals Reference

The system supports all 17 UN SDGs:

| # | Goal | # | Goal |
|---|------|---|------|
| 1 | No Poverty | 10 | Reduced Inequalities |
| 2 | Zero Hunger | 11 | Sustainable Cities and Communities |
| 3 | Good Health and Well-Being | 12 | Responsible Consumption and Production |
| 4 | Quality Education | 13 | Climate Action |
| 5 | Gender Equality | 14 | Life Below Water |
| 6 | Clean Water and Sanitation | 15 | Life on Land |
| 7 | Affordable and Clean Energy | 16 | Peace, Justice and Strong Institutions |
| 8 | Decent Work and Economic Growth | 17 | Partnerships for the Goals |
| 9 | Industry, Innovation and Infrastructure | | |

---

## License

This project is developed for academic use at M.S. Ramaiah Institute of Technology, Bangalore.
