from models.submission import SubmissionStatus
from models.workflow_event import WorkflowAction
from models.user import Role


TRANSITIONS: dict[tuple[SubmissionStatus, WorkflowAction], tuple[SubmissionStatus, frozenset[Role]]] = {
    (SubmissionStatus.DRAFT,               WorkflowAction.SUBMIT):   (SubmissionStatus.PENDING_HOD,       frozenset({Role.SUBMITTER})),
    (SubmissionStatus.DRAFT,               WorkflowAction.WITHDRAW): (SubmissionStatus.WITHDRAWN,          frozenset({Role.SUBMITTER})),
    (SubmissionStatus.PENDING_HOD,         WorkflowAction.APPROVE):  (SubmissionStatus.PENDING_COMMITTEE,  frozenset({Role.HOD})),
    (SubmissionStatus.PENDING_HOD,         WorkflowAction.REJECT):   (SubmissionStatus.REJECTED_HOD,       frozenset({Role.HOD})),
    (SubmissionStatus.PENDING_HOD,         WorkflowAction.WITHDRAW): (SubmissionStatus.WITHDRAWN,          frozenset({Role.SUBMITTER})),
    (SubmissionStatus.PENDING_COMMITTEE,   WorkflowAction.APPROVE):  (SubmissionStatus.APPROVED,           frozenset({Role.SDG_COMMITTEE})),
    (SubmissionStatus.PENDING_COMMITTEE,   WorkflowAction.REJECT):   (SubmissionStatus.REJECTED_COMM,      frozenset({Role.SDG_COMMITTEE})),
    (SubmissionStatus.REJECTED_HOD,        WorkflowAction.RESUBMIT): (SubmissionStatus.PENDING_HOD,        frozenset({Role.SUBMITTER})),
    (SubmissionStatus.REJECTED_COMM,       WorkflowAction.RESUBMIT): (SubmissionStatus.PENDING_COMMITTEE,  frozenset({Role.HOD})),
}

ACTIONS_REQUIRING_NOTE: frozenset[WorkflowAction] = frozenset({WorkflowAction.REJECT})


class InvalidTransitionError(Exception):
    def __init__(self, from_status: SubmissionStatus, action: WorkflowAction, role: Role) -> None:
        self.from_status = from_status
        self.action = action
        self.role = role
        super().__init__(f"Cannot {action.value} from {from_status.value} as {role.value}")


def transition(
    current_status: SubmissionStatus,
    action: WorkflowAction,
    actor_role: Role,
) -> SubmissionStatus:
    key = (current_status, action)
    entry = TRANSITIONS.get(key)
    if entry is None:
        raise InvalidTransitionError(current_status, action, actor_role)
    new_status, allowed_roles = entry
    if actor_role not in allowed_roles:
        raise InvalidTransitionError(current_status, action, actor_role)
    return new_status
