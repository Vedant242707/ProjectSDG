"""
Pure unit tests for the state machine. No DB, no async, no fixtures required.
These run in milliseconds and need zero infrastructure.
"""
import pytest

from models.submission import SubmissionStatus
from models.workflow_event import WorkflowAction
from models.user import Role
from core.workflow.state_machine import transition, InvalidTransitionError


class TestHappyPath:
    def test_submit_draft(self):
        result = transition(SubmissionStatus.DRAFT, WorkflowAction.SUBMIT, Role.SUBMITTER)
        assert result == SubmissionStatus.PENDING_HOD

    def test_hod_approve(self):
        result = transition(SubmissionStatus.PENDING_HOD, WorkflowAction.APPROVE, Role.HOD)
        assert result == SubmissionStatus.PENDING_COMMITTEE

    def test_committee_approve(self):
        result = transition(SubmissionStatus.PENDING_COMMITTEE, WorkflowAction.APPROVE, Role.SDG_COMMITTEE)
        assert result == SubmissionStatus.APPROVED

    def test_full_chain(self):
        status = SubmissionStatus.DRAFT
        status = transition(status, WorkflowAction.SUBMIT, Role.SUBMITTER)
        assert status == SubmissionStatus.PENDING_HOD
        status = transition(status, WorkflowAction.APPROVE, Role.HOD)
        assert status == SubmissionStatus.PENDING_COMMITTEE
        status = transition(status, WorkflowAction.APPROVE, Role.SDG_COMMITTEE)
        assert status == SubmissionStatus.APPROVED


class TestRejectionPaths:
    def test_hod_reject(self):
        result = transition(SubmissionStatus.PENDING_HOD, WorkflowAction.REJECT, Role.HOD)
        assert result == SubmissionStatus.REJECTED_HOD

    def test_committee_reject(self):
        result = transition(SubmissionStatus.PENDING_COMMITTEE, WorkflowAction.REJECT, Role.SDG_COMMITTEE)
        assert result == SubmissionStatus.REJECTED_COMM

    def test_resubmit_after_hod_reject(self):
        result = transition(SubmissionStatus.REJECTED_HOD, WorkflowAction.RESUBMIT, Role.SUBMITTER)
        assert result == SubmissionStatus.PENDING_HOD

    def test_resubmit_after_committee_reject(self):
        result = transition(SubmissionStatus.REJECTED_COMM, WorkflowAction.RESUBMIT, Role.HOD)
        assert result == SubmissionStatus.PENDING_COMMITTEE

    def test_hod_can_return_committee_rejection_to_submitter(self):
        result = transition(SubmissionStatus.REJECTED_COMM, WorkflowAction.REJECT, Role.HOD)
        assert result == SubmissionStatus.REJECTED_HOD

    def test_full_reject_resubmit_approve_cycle(self):
        status = SubmissionStatus.DRAFT
        status = transition(status, WorkflowAction.SUBMIT, Role.SUBMITTER)
        assert status == SubmissionStatus.PENDING_HOD
        status = transition(status, WorkflowAction.REJECT, Role.HOD)
        assert status == SubmissionStatus.REJECTED_HOD
        status = transition(status, WorkflowAction.RESUBMIT, Role.SUBMITTER)
        assert status == SubmissionStatus.PENDING_HOD
        status = transition(status, WorkflowAction.APPROVE, Role.HOD)
        assert status == SubmissionStatus.PENDING_COMMITTEE
        status = transition(status, WorkflowAction.APPROVE, Role.SDG_COMMITTEE)
        assert status == SubmissionStatus.APPROVED


class TestWithdrawal:
    def test_withdraw_from_draft(self):
        result = transition(SubmissionStatus.DRAFT, WorkflowAction.WITHDRAW, Role.SUBMITTER)
        assert result == SubmissionStatus.WITHDRAWN

    def test_withdraw_from_pending_hod(self):
        result = transition(SubmissionStatus.PENDING_HOD, WorkflowAction.WITHDRAW, Role.SUBMITTER)
        assert result == SubmissionStatus.WITHDRAWN


class TestIllegalTransitions:
    def test_submitter_cannot_approve(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.PENDING_HOD, WorkflowAction.APPROVE, Role.SUBMITTER)

    def test_hod_cannot_approve_at_committee_stage(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.PENDING_COMMITTEE, WorkflowAction.APPROVE, Role.HOD)

    def test_committee_cannot_approve_at_hod_stage(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.PENDING_HOD, WorkflowAction.APPROVE, Role.SDG_COMMITTEE)

    def test_no_action_on_approved(self):
        for action in WorkflowAction:
            with pytest.raises(InvalidTransitionError, match=f"Cannot {action.value} from APPROVED"):
                transition(SubmissionStatus.APPROVED, action, Role.SUBMITTER)

    def test_no_action_on_withdrawn(self):
        for action in WorkflowAction:
            with pytest.raises(InvalidTransitionError, match=f"Cannot {action.value} from WITHDRAWN"):
                transition(SubmissionStatus.WITHDRAWN, action, Role.SUBMITTER)

    def test_submit_from_pending(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.PENDING_HOD, WorkflowAction.SUBMIT, Role.SUBMITTER)

    def test_resubmit_from_draft(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.DRAFT, WorkflowAction.RESUBMIT, Role.SUBMITTER)

    def test_submitter_cannot_resubmit_after_committee_reject(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.REJECTED_COMM, WorkflowAction.RESUBMIT, Role.SUBMITTER)

    def test_hod_cannot_resubmit_after_hod_reject(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.REJECTED_HOD, WorkflowAction.RESUBMIT, Role.HOD)

    def test_committee_cannot_submit(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.DRAFT, WorkflowAction.SUBMIT, Role.SDG_COMMITTEE)

    def test_admin_cannot_approve(self):
        with pytest.raises(InvalidTransitionError):
            transition(SubmissionStatus.PENDING_HOD, WorkflowAction.APPROVE, Role.ADMIN)

    def test_error_attributes_are_set(self):
        try:
            transition(SubmissionStatus.PENDING_HOD, WorkflowAction.APPROVE, Role.SUBMITTER)
        except InvalidTransitionError as e:
            assert e.from_status == SubmissionStatus.PENDING_HOD
            assert e.action == WorkflowAction.APPROVE
            assert e.role == Role.SUBMITTER
            assert "APPROVE" in str(e)
            assert "PENDING_HOD" in str(e)
            assert "SUBMITTER" in str(e)
