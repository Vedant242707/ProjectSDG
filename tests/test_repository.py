"""Integration tests for repository finalization and search (Phase 4)."""
import pytest

from core.services.repository_service import finalize_submission, get_academic_year, search_repository
from core.services.workflow_service import execute_transition
from models.repository import Repository
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
    description: str = "A detailed description of this test SDG submission",
    sub_type: SubmissionType = SubmissionType.PROJECT,
    dept_key: str = "cs_dept",
) -> Submission:
    sub = Submission(
        submission_id=submission_id,
        submitter_id=seed_data["submitter"].id,
        department_id=seed_data[dept_key].id,
        title=title,
        description=description,
        type=sub_type,
        sdg_tags=sdg_tags,
        status=SubmissionStatus.DRAFT,
        attachments=[],
    )
    await sub.insert()
    return sub


async def _approve(
    submission: Submission,
    seed_data: dict,
    hod_key: str = "hod_cs",
) -> None:
    sub_id = str(submission.id)
    await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])
    await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data[hod_key])
    await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["committee"])


# ---------------------------------------------------------------------------
# TestRepositoryFinalization
# ---------------------------------------------------------------------------

class TestRepositoryFinalization:
    async def test_approved_submission_creates_repository_entry(self, seed_data):
        sub = await _make_submission(
            seed_data, "SDG-2026-CS-00001", sdg_tags=[4, 7], title="SDG Education Project"
        )
        await _approve(sub, seed_data)

        entries = await Repository.find(
            Repository.submission_id == "SDG-2026-CS-00001"
        ).to_list()
        assert len(entries) == 1

        entry = entries[0]
        assert entry.submission_id == "SDG-2026-CS-00001"
        assert entry.title == "SDG Education Project"
        assert 4 in entry.sdg_tags
        assert 7 in entry.sdg_tags
        assert entry.department_code == "CS"
        assert entry.department_name == "Computer Science"
        assert "-" in entry.academic_year

    async def test_finalization_is_idempotent(self, seed_data):
        sub = await _make_submission(seed_data, "SDG-2026-CS-00002", sdg_tags=[7])
        await _approve(sub, seed_data)

        # finalize_submission is already called inside execute_transition (APPROVED path).
        # Calling it again must be a no-op.
        refreshed = await Submission.get(sub.id)
        await finalize_submission(refreshed)
        await finalize_submission(refreshed)  # third call

        count = await Repository.find(
            Repository.submission_id == "SDG-2026-CS-00002"
        ).count()
        assert count == 1

    async def test_repository_entry_has_correct_academic_year(self, seed_data):
        sub = await _make_submission(seed_data, "SDG-2026-CS-00003", sdg_tags=[13])
        await _approve(sub, seed_data)

        entry = await Repository.find_one(Repository.submission_id == "SDG-2026-CS-00003")
        assert entry is not None

        expected = get_academic_year()
        assert entry.academic_year == expected

        parts = entry.academic_year.split("-")
        assert len(parts) == 2
        assert parts[0].isdigit() and parts[1].isdigit()
        assert int(parts[1]) == int(parts[0]) + 1


# ---------------------------------------------------------------------------
# TestRepositorySearch
# ---------------------------------------------------------------------------

class TestRepositorySearch:
    async def test_search_all_returns_everything(self, seed_data):
        for i, tags in enumerate([[4, 7], [7, 13], [1]], start=1):
            sub = await _make_submission(seed_data, f"SDG-2026-CS-S{i:02d}", tags)
            await _approve(sub, seed_data)

        entries, total = await search_repository()
        assert total == 3
        assert len(entries) == 3

    async def test_search_by_sdg_tag(self, seed_data):
        sub_a = await _make_submission(
            seed_data, "SDG-2026-CS-T01", [7, 13], title="Solar Energy Project"
        )
        sub_b = await _make_submission(
            seed_data, "SDG-2026-CS-T02", [4], title="Education Initiative"
        )
        await _approve(sub_a, seed_data)
        await _approve(sub_b, seed_data)

        results_7, count_7 = await search_repository(sdg_tag=7)
        ids_7 = {e.submission_id for e in results_7}
        assert "SDG-2026-CS-T01" in ids_7
        assert "SDG-2026-CS-T02" not in ids_7
        assert count_7 == 1

        results_1, count_1 = await search_repository(sdg_tag=1)
        assert count_1 == 0

    async def test_search_by_department(self, seed_data):
        # CS submission
        cs_sub = await _make_submission(seed_data, "SDG-2026-CS-D01", [4])
        await _approve(cs_sub, seed_data, hod_key="hod_cs")

        # ME submission — create directly to bypass department membership check in the service
        me_sub = await _make_submission(
            seed_data, "SDG-2026-ME-D01", [9], dept_key="me_dept"
        )
        await _approve(me_sub, seed_data, hod_key="hod_me")

        cs_results, cs_count = await search_repository(
            department_id=str(seed_data["cs_dept"].id)
        )
        cs_ids = {e.submission_id for e in cs_results}
        assert "SDG-2026-CS-D01" in cs_ids
        assert "SDG-2026-ME-D01" not in cs_ids
        assert cs_count == 1

    async def test_search_by_keyword(self, seed_data):
        sub_solar = await _make_submission(
            seed_data, "SDG-2026-CS-K01", [7], title="Solar Panel Innovation Project"
        )
        sub_edu = await _make_submission(
            seed_data, "SDG-2026-CS-K02", [4], title="Education for All Initiative"
        )
        await _approve(sub_solar, seed_data)
        await _approve(sub_edu, seed_data)

        solar_results, solar_count = await search_repository(keyword="solar")
        solar_ids = {e.submission_id for e in solar_results}
        assert "SDG-2026-CS-K01" in solar_ids
        assert "SDG-2026-CS-K02" not in solar_ids

        quantum_results, quantum_count = await search_repository(keyword="quantum")
        assert quantum_count == 0

    async def test_search_by_submission_type(self, seed_data):
        proj = await _make_submission(
            seed_data, "SDG-2026-CS-TY1", [4], sub_type=SubmissionType.PROJECT
        )
        research = await _make_submission(
            seed_data, "SDG-2026-CS-TY2", [7], sub_type=SubmissionType.RESEARCH
        )
        await _approve(proj, seed_data)
        await _approve(research, seed_data)

        proj_results, proj_count = await search_repository(submission_type="PROJECT")
        proj_ids = {e.submission_id for e in proj_results}
        assert "SDG-2026-CS-TY1" in proj_ids
        assert "SDG-2026-CS-TY2" not in proj_ids
        assert proj_count == 1

    async def test_pagination(self, seed_data):
        for i in range(5):
            sub = await _make_submission(
                seed_data, f"SDG-2026-CS-P{i:02d}", sdg_tags=[(i % 3) + 4]
            )
            await _approve(sub, seed_data)

        page1, total = await search_repository(page=1, page_size=2)
        assert total == 5
        assert len(page1) == 2

        page2, _ = await search_repository(page=2, page_size=2)
        assert len(page2) == 2

        page3, _ = await search_repository(page=3, page_size=2)
        assert len(page3) == 1

        # No overlap between pages
        p1_ids = {e.submission_id for e in page1}
        p2_ids = {e.submission_id for e in page2}
        p3_ids = {e.submission_id for e in page3}
        assert p1_ids.isdisjoint(p2_ids)
        assert p1_ids.isdisjoint(p3_ids)
        assert p2_ids.isdisjoint(p3_ids)
