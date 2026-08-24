"""
Async integration tests for workflow_service.execute_transition().
Each test gets a fresh, isolated MongoDB database via the test_db fixture.
"""
import pytest
from fastapi import HTTPException

from models.submission import SubmissionStatus
from models.workflow_event import WorkflowAction
from core.services.workflow_service import execute_transition, get_submission_timeline


class TestFullApprovalCycle:
    async def test_draft_to_approved(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)

        result = await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])
        assert result.status == SubmissionStatus.PENDING_HOD

        result = await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])
        assert result.status == SubmissionStatus.PENDING_COMMITTEE

        result = await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["committee"])
        assert result.status == SubmissionStatus.APPROVED

        events = await get_submission_timeline(sub_id)
        assert len(events) == 3

        assert events[0].action == WorkflowAction.SUBMIT
        assert events[0].from_status == SubmissionStatus.DRAFT
        assert events[0].to_status == SubmissionStatus.PENDING_HOD

        assert events[1].action == WorkflowAction.APPROVE
        assert events[1].from_status == SubmissionStatus.PENDING_HOD
        assert events[1].to_status == SubmissionStatus.PENDING_COMMITTEE

        assert events[2].action == WorkflowAction.APPROVE
        assert events[2].from_status == SubmissionStatus.PENDING_COMMITTEE
        assert events[2].to_status == SubmissionStatus.APPROVED

        # Timeline must be chronologically ordered
        timestamps = [e.timestamp for e in events]
        assert timestamps == sorted(timestamps)


class TestHODScopeIsolation:
    async def test_hod_cannot_approve_other_department(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])

        with pytest.raises(HTTPException) as exc_info:
            await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_me"])
        assert exc_info.value.status_code == 403

    async def test_hod_can_approve_own_department(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])

        result = await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])
        assert result.status == SubmissionStatus.PENDING_COMMITTEE


class TestRejectionFlow:
    async def test_hod_reject_and_resubmit(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        note = "Needs more detail about the project scope and SDG alignment"

        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])

        result = await execute_transition(
            sub_id, WorkflowAction.REJECT, seed_data["hod_cs"], note=note
        )
        assert result.status == SubmissionStatus.REJECTED_HOD

        events = await get_submission_timeline(sub_id)
        reject_event = events[-1]
        assert reject_event.action == WorkflowAction.REJECT
        assert reject_event.note == note

        result = await execute_transition(sub_id, WorkflowAction.RESUBMIT, seed_data["submitter"])
        assert result.status == SubmissionStatus.PENDING_HOD

        result = await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])
        assert result.status == SubmissionStatus.PENDING_COMMITTEE

    async def test_committee_reject_and_hod_resubmit(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        note = "Impact metrics insufficient to demonstrate SDG 7 alignment"

        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])
        await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])

        result = await execute_transition(
            sub_id, WorkflowAction.REJECT, seed_data["committee"], note=note
        )
        assert result.status == SubmissionStatus.REJECTED_COMM

        events = await get_submission_timeline(sub_id)
        assert events[-1].note == note

        result = await execute_transition(sub_id, WorkflowAction.RESUBMIT, seed_data["hod_cs"])
        assert result.status == SubmissionStatus.PENDING_COMMITTEE

        result = await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["committee"])
        assert result.status == SubmissionStatus.APPROVED

    async def test_hod_can_return_committee_rejection_to_submitter(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])
        await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])
        await execute_transition(
            sub_id, WorkflowAction.REJECT, seed_data["committee"],
            note="Please strengthen the evidence supporting the stated SDG impact",
        )

        result = await execute_transition(
            sub_id, WorkflowAction.REJECT, seed_data["hod_cs"],
            note="Please revise the impact evidence before this can be resubmitted",
        )
        assert result.status == SubmissionStatus.REJECTED_HOD


class TestConcurrency:
    async def test_double_approve_race(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])

        # First approve wins
        result = await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])
        assert result.status == SubmissionStatus.PENDING_COMMITTEE

        # Second approve on same submission: status already changed, must fail
        with pytest.raises(HTTPException) as exc_info:
            await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])
        assert exc_info.value.status_code in (400, 409)


class TestMandatoryNote:
    async def test_reject_without_note_fails(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])

        with pytest.raises(HTTPException) as exc_info:
            await execute_transition(sub_id, WorkflowAction.REJECT, seed_data["hod_cs"], note=None)
        assert exc_info.value.status_code == 400

    async def test_reject_with_short_note_fails(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])

        with pytest.raises(HTTPException) as exc_info:
            await execute_transition(sub_id, WorkflowAction.REJECT, seed_data["hod_cs"], note="bad")
        assert exc_info.value.status_code == 400

    async def test_reject_with_valid_note_succeeds(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])

        result = await execute_transition(
            sub_id,
            WorkflowAction.REJECT,
            seed_data["hod_cs"],
            note="Insufficient evidence provided for SDG claim",
        )
        assert result.status == SubmissionStatus.REJECTED_HOD


class TestTerminalStates:
    async def test_no_action_after_approved(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)

        await execute_transition(sub_id, WorkflowAction.SUBMIT, seed_data["submitter"])
        await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["hod_cs"])
        await execute_transition(sub_id, WorkflowAction.APPROVE, seed_data["committee"])

        for action in WorkflowAction:
            with pytest.raises(HTTPException) as exc_info:
                # Use submitter as actor; role gates fire before state machine for most paths
                await execute_transition(sub_id, action, seed_data["submitter"])
            assert exc_info.value.status_code in (400, 403, 409)

    async def test_no_action_after_withdrawn(self, draft_submission, seed_data):
        sub_id = str(draft_submission.id)
        await execute_transition(sub_id, WorkflowAction.WITHDRAW, seed_data["submitter"])

        for action in WorkflowAction:
            with pytest.raises(HTTPException) as exc_info:
                await execute_transition(sub_id, action, seed_data["submitter"])
            assert exc_info.value.status_code in (400, 403, 409)
