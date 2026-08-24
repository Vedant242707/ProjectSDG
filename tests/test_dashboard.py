"""Tests for dashboard aggregation, public endpoints, and file upload (Phase 4)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from core.services.dashboard_service import get_dashboard_summary, get_sdg_detail
from core.services.workflow_service import execute_transition
from models.submission import Submission, SubmissionStatus, SubmissionType
from models.workflow_event import WorkflowAction


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _make_submission(
    seed_data: dict,
    submission_id: str,
    sdg_tags: list,
    title: str = "Test SDG Project",
    dept_key: str = "cs_dept",
) -> Submission:
    sub = Submission(
        submission_id=submission_id,
        submitter_id=seed_data["submitter"].id,
        department_id=seed_data[dept_key].id,
        title=title,
        description="A detailed description of this test SDG project for dashboard",
        type=SubmissionType.PROJECT,
        sdg_tags=sdg_tags,
        status=SubmissionStatus.DRAFT,
        attachments=[],
    )
    await sub.insert()
    return sub


async def _approve(submission: Submission, seed_data: dict, hod_key: str = "hod_cs") -> None:
    sub_id = str(submission.id)
    await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])
    await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data[hod_key])
    await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["committee"])


def _make_upload_file(filename: str, content_type: str, content: bytes):
    """Return a MagicMock that looks like a FastAPI UploadFile."""
    mock = MagicMock()
    mock.filename = filename
    mock.content_type = content_type
    mock.read = AsyncMock(return_value=content)
    return mock


# ---------------------------------------------------------------------------
# TestDashboardSummary — exercises get_dashboard_summary() directly (no Redis)
# ---------------------------------------------------------------------------

class TestDashboardSummary:
    async def test_empty_dashboard(self, test_db):
        summary = await get_dashboard_summary()

        assert len(summary["sdg_breakdown"]) == 17
        for entry in summary["sdg_breakdown"]:
            assert entry["total_approved"] == 0
            assert entry["in_review"] == 0
            assert entry["completed_this_year"] == 0

        assert summary["totals"]["total_submissions"] == 0
        assert summary["totals"]["total_approved"] == 0
        assert summary["totals"]["total_in_review"] == 0

    async def test_dashboard_counts_approved(self, seed_data):
        sub1 = await _make_submission(seed_data, "SDG-2026-CS-D01", [4, 7])
        sub2 = await _make_submission(seed_data, "SDG-2026-CS-D02", [4, 7])
        await _approve(sub1, seed_data)
        await _approve(sub2, seed_data)

        summary = await get_dashboard_summary()
        sdg_map = {e["sdg_number"]: e for e in summary["sdg_breakdown"]}

        assert sdg_map[4]["total_approved"] == 2
        assert sdg_map[7]["total_approved"] == 2
        assert sdg_map[1]["total_approved"] == 0

    async def test_dashboard_counts_in_review(self, seed_data):
        sub = await _make_submission(seed_data, "SDG-2026-CS-IR1", [13], title="Climate Change Project")
        # Submit only — leaves in PENDING_HOD (counts as in_review)
        await execute_transition(str(sub.id), WorkflowAction.SUBMIT, seed_data["submitter"])

        summary = await get_dashboard_summary()
        sdg_map = {e["sdg_number"]: e for e in summary["sdg_breakdown"]}
        assert sdg_map[13]["in_review"] == 1
        assert sdg_map[13]["total_approved"] == 0

    async def test_public_sdg_detail_excludes_unapproved_submissions(self, seed_data):
        approved = await _make_submission(seed_data, "SDG-2026-CS-PUB1", [4], title="Approved project")
        draft = await _make_submission(seed_data, "SDG-2026-CS-PUB2", [4], title="Private draft")
        await _approve(approved, seed_data)

        detail = await get_sdg_detail(4)

        assert detail["total"] == 1
        assert [submission["title"] for submission in detail["submissions"]] == ["Approved project"]

    async def test_dashboard_department_breakdown(self, seed_data):
        cs_sub = await _make_submission(seed_data, "SDG-2026-CS-DB1", [4])
        await _approve(cs_sub, seed_data, hod_key="hod_cs")

        me_sub = await _make_submission(seed_data, "SDG-2026-ME-DB1", [9], dept_key="me_dept")
        await _approve(me_sub, seed_data, hod_key="hod_me")

        summary = await get_dashboard_summary()
        dept_map = {d["department_code"]: d for d in summary["department_breakdown"]}

        assert "CS" in dept_map
        assert "ME" in dept_map
        assert dept_map["CS"]["count"] == 1
        assert dept_map["ME"]["count"] == 1

    async def test_dashboard_totals(self, seed_data):
        # 1 approved
        approved_sub = await _make_submission(seed_data, "SDG-2026-CS-TOT1", [4])
        await _approve(approved_sub, seed_data)

        # 1 in review (PENDING_HOD)
        pending_sub = await _make_submission(seed_data, "SDG-2026-CS-TOT2", [7])
        await execute_transition(str(pending_sub.id), WorkflowAction.SUBMIT, seed_data["submitter"])

        # 1 plain draft (no transition)
        await _make_submission(seed_data, "SDG-2026-CS-TOT3", [13])

        summary = await get_dashboard_summary()
        assert summary["totals"]["total_submissions"] == 3
        assert summary["totals"]["total_approved"] == 1
        assert summary["totals"]["total_in_review"] == 1

    async def test_all_17_sdgs_always_present(self, test_db):
        summary = await get_dashboard_summary()

        assert len(summary["sdg_breakdown"]) == 17
        numbers = [e["sdg_number"] for e in summary["sdg_breakdown"]]
        assert sorted(numbers) == list(range(1, 18))
        for entry in summary["sdg_breakdown"]:
            assert entry["sdg_name"]  # non-empty string

    async def test_summary_has_last_updated_field(self, test_db):
        summary = await get_dashboard_summary()
        assert "last_updated" in summary
        assert summary["last_updated"]  # non-empty


# ---------------------------------------------------------------------------
# TestDashboardEndpoint — HTTP-level tests using ASGITransport (no lifespan)
# ---------------------------------------------------------------------------

class TestDashboardEndpoint:
    async def test_dashboard_summary_is_public(self, test_db):
        from httpx import AsyncClient, ASGITransport
        from main import app

        mock_summary = {
            "sdg_breakdown": [],
            "totals": {"total_submissions": 0, "total_approved": 0, "total_in_review": 0},
            "department_breakdown": [],
            "last_updated": "2026-01-01T00:00:00+00:00",
        }
        with patch(
            "core.routes.dashboard_routes.dashboard_service.get_cached_dashboard",
            new_callable=AsyncMock,
            return_value=mock_summary,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get("/dashboard/summary")

        assert response.status_code == 200
        data = response.json()
        assert "sdg_breakdown" in data
        assert "totals" in data

    async def test_repository_search_requires_auth(self, test_db):
        from httpx import AsyncClient, ASGITransport
        from main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/repository")

        assert response.status_code == 401

    async def test_sdg_single_endpoint_is_public(self, test_db):
        from httpx import AsyncClient, ASGITransport
        from main import app

        mock_summary = {
            "sdg_breakdown": [
                {
                    "sdg_number": i,
                    "sdg_name": f"SDG {i}",
                    "total_approved": 0,
                    "in_review": 0,
                    "completed_this_year": 0,
                }
                for i in range(1, 18)
            ],
            "totals": {"total_submissions": 0, "total_approved": 0, "total_in_review": 0},
            "department_breakdown": [],
            "last_updated": "2026-01-01T00:00:00+00:00",
        }
        with patch(
            "core.routes.dashboard_routes.dashboard_service.get_cached_dashboard",
            new_callable=AsyncMock,
            return_value=mock_summary,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get("/dashboard/sdg/4")

        assert response.status_code == 200
        assert response.json()["sdg_number"] == 4

    async def test_sdg_endpoint_rejects_invalid_number(self, test_db):
        from httpx import AsyncClient, ASGITransport
        from main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/dashboard/sdg/18")

        assert response.status_code == 400


# ---------------------------------------------------------------------------
# TestFileUpload — exercises file_service directly; MinIO is mocked
# ---------------------------------------------------------------------------

class TestFileUpload:
    async def test_upload_file_success(self, draft_submission, seed_data):
        from core.services.file_service import upload_file

        mock_client = MagicMock()
        mock_client.put_object.return_value = None

        mock_file = _make_upload_file("test.pdf", "application/pdf", b"%PDF-1.4 test content")

        with patch("core.services.file_service.get_minio_client", return_value=mock_client):
            result = await upload_file(mock_file, str(draft_submission.id), str(seed_data["submitter"].id))

        assert result["original_filename"] == "test.pdf"
        assert result["content_type"] == "application/pdf"
        assert result["size"] == len(b"%PDF-1.4 test content")
        assert "object_name" in result

        updated = await Submission.get(draft_submission.id)
        assert len(updated.attachments) == 1
        assert updated.attachments[0]["object_name"] == result["object_name"]

    async def test_upload_rejects_large_file(self, draft_submission, seed_data):
        from fastapi import HTTPException
        from core.services.file_service import upload_file

        oversized = b"x" * (10 * 1024 * 1024 + 1)  # 10 MB + 1 byte
        mock_file = _make_upload_file("big.pdf", "application/pdf", oversized)

        with pytest.raises(HTTPException) as exc_info:
            await upload_file(mock_file, str(draft_submission.id), str(seed_data["submitter"].id))

        assert exc_info.value.status_code == 413

    async def test_upload_rejects_wrong_content_type(self, draft_submission, seed_data):
        from fastapi import HTTPException
        from core.services.file_service import upload_file

        mock_file = _make_upload_file("malware.exe", "application/octet-stream", b"MZ")

        with pytest.raises(HTTPException) as exc_info:
            await upload_file(mock_file, str(draft_submission.id), str(seed_data["submitter"].id))

        assert exc_info.value.status_code == 400

    async def test_upload_max_5_files(self, draft_submission, seed_data):
        from fastapi import HTTPException
        from core.services.file_service import upload_file

        mock_client = MagicMock()
        mock_client.put_object.return_value = None

        with patch("core.services.file_service.get_minio_client", return_value=mock_client):
            for i in range(5):
                f = _make_upload_file(f"file{i}.pdf", "application/pdf", b"%PDF-1.4 ok")
                await upload_file(f, str(draft_submission.id), str(seed_data["submitter"].id))

            sixth = _make_upload_file("extra.pdf", "application/pdf", b"%PDF-1.4 ok")
            with pytest.raises(HTTPException) as exc_info:
                await upload_file(sixth, str(draft_submission.id), str(seed_data["submitter"].id))

        assert exc_info.value.status_code == 400
        assert "Maximum" in exc_info.value.detail

    async def test_cannot_upload_to_submitted_submission(self, draft_submission, seed_data):
        """Status check lives in the route helper, not the service — test it directly."""
        from fastapi import HTTPException
        from core.routes.file_routes import _get_owned_submission

        # Advance to PENDING_HOD
        await execute_transition(str(draft_submission.id), WorkflowAction.SUBMIT, seed_data["submitter"])

        with pytest.raises(HTTPException) as exc_info:
            await _get_owned_submission(str(draft_submission.id), seed_data["submitter"])

        assert exc_info.value.status_code == 400

    async def test_cannot_upload_to_another_users_submission(self, draft_submission, seed_data):
        """Non-owner gets 403 from the route helper."""
        from fastapi import HTTPException
        from core.routes.file_routes import _get_owned_submission

        with pytest.raises(HTTPException) as exc_info:
            await _get_owned_submission(str(draft_submission.id), seed_data["hod_cs"])

        assert exc_info.value.status_code == 403

    async def test_upload_nonexistent_submission(self, test_db, seed_data):
        from fastapi import HTTPException
        from core.services.file_service import upload_file

        fake_id = "507f1f77bcf86cd799439011"
        mock_file = _make_upload_file("test.pdf", "application/pdf", b"%PDF-1.4 x")

        with pytest.raises(HTTPException) as exc_info:
            await upload_file(mock_file, fake_id, str(seed_data["submitter"].id))

        assert exc_info.value.status_code == 404
