"""Tests for notification service, Celery dispatch wiring, and WebSocket endpoint."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, WebSocketDisconnect

from core.services import notification_service
from models.submission import SubmissionStatus
from models.workflow_event import WorkflowAction


class TestNotificationService:
    async def test_create_notification(self, seed_data):
        user = seed_data["submitter"]
        notif = await notification_service.create_notification(
            user.id, "Your submission has been received"
        )
        assert notif.id is not None
        assert notif.user_id == user.id
        assert notif.message == "Your submission has been received"
        assert notif.read is False

    async def test_get_user_notifications(self, seed_data):
        user = seed_data["submitter"]
        for i in range(3):
            await notification_service.create_notification(user.id, f"Notification {i}")

        notifications, unread_count = await notification_service.get_user_notifications(user.id)
        assert len(notifications) == 3
        assert unread_count == 3

    async def test_mark_as_read(self, seed_data):
        user = seed_data["submitter"]
        notif = await notification_service.create_notification(user.id, "Please read this message")
        assert notif.read is False

        updated = await notification_service.mark_as_read(str(notif.id), user.id)
        assert updated.read is True

        _, unread_count = await notification_service.get_user_notifications(user.id)
        assert unread_count == 0

    async def test_mark_all_read(self, seed_data):
        user = seed_data["submitter"]
        for i in range(5):
            await notification_service.create_notification(user.id, f"Batch notification {i}")

        modified = await notification_service.mark_all_read(user.id)
        assert modified == 5

        _, unread_count = await notification_service.get_user_notifications(user.id)
        assert unread_count == 0

    async def test_cannot_read_other_users_notification(self, seed_data):
        owner = seed_data["submitter"]
        other = seed_data["hod_cs"]
        notif = await notification_service.create_notification(owner.id, "Private message for owner")

        with pytest.raises(HTTPException) as exc_info:
            await notification_service.mark_as_read(str(notif.id), other.id)
        assert exc_info.value.status_code == 403


class TestNotificationDispatch:
    async def test_submit_creates_notifications(self, draft_submission, seed_data):
        from core.services.workflow_service import execute_transition

        with (
            patch("core.services.workflow_service.notify_submission_created") as mock_created,
            patch("core.services.workflow_service.notify_hod_new_submission") as mock_hod_new,
        ):
            result = await execute_transition(
                str(draft_submission.id), WorkflowAction.SUBMIT, seed_data["submitter"]
            )

        assert result.status == SubmissionStatus.PENDING_HOD
        mock_created.delay.assert_called_once()
        submitter_arg = mock_created.delay.call_args[0][0]
        assert submitter_arg == str(seed_data["submitter"].id)
        mock_hod_new.delay.assert_called_once()

    async def test_hod_approve_notifies_submitter(self, draft_submission, seed_data):
        from core.services.workflow_service import execute_transition

        # Get submission to PENDING_HOD without tracking those notifications
        with (
            patch("core.services.workflow_service.notify_submission_created"),
            patch("core.services.workflow_service.notify_hod_new_submission"),
        ):
            await execute_transition(
                str(draft_submission.id), WorkflowAction.SUBMIT, seed_data["submitter"]
            )

        with patch("core.services.workflow_service.notify_hod_approved") as mock_approved:
            result = await execute_transition(
                str(draft_submission.id), WorkflowAction.APPROVE, seed_data["hod_cs"]
            )

        assert result.status == SubmissionStatus.PENDING_COMMITTEE
        mock_approved.delay.assert_called_once()
        submitter_arg = mock_approved.delay.call_args[0][0]
        assert submitter_arg == str(seed_data["submitter"].id)

    async def test_reject_notification_includes_note(self, draft_submission, seed_data):
        from core.services.workflow_service import execute_transition

        note = "Project does not clearly demonstrate SDG alignment criteria"

        with (
            patch("core.services.workflow_service.notify_submission_created"),
            patch("core.services.workflow_service.notify_hod_new_submission"),
        ):
            await execute_transition(
                str(draft_submission.id), WorkflowAction.SUBMIT, seed_data["submitter"]
            )

        with patch("core.services.workflow_service.notify_hod_rejected") as mock_rejected:
            result = await execute_transition(
                str(draft_submission.id), WorkflowAction.REJECT, seed_data["hod_cs"], note=note
            )

        assert result.status == SubmissionStatus.REJECTED_HOD
        mock_rejected.delay.assert_called_once()
        # notify_hod_rejected.delay(submitter_id, sub_id, human_id, note)
        note_arg = mock_rejected.delay.call_args[0][3]
        assert note_arg == note


class TestWebSocket:
    async def test_ws_rejects_invalid_token(self, test_db):
        from core.routes.ws_routes import submission_status_ws

        ws = AsyncMock()
        await submission_status_ws(ws, "507f1f77bcf86cd799439011", token="not.a.valid.jwt")

        ws.close.assert_called_once_with(code=4001, reason="Invalid token")
        ws.accept.assert_not_called()

    async def test_ws_receives_current_status_on_connect(self, draft_submission, seed_data):
        from jose import jwt as jose_jwt

        from config.settings import settings
        from core.routes.ws_routes import submission_status_ws

        token = jose_jwt.encode(
            {"user_id": str(seed_data["submitter"].id)},
            settings.JWT_SECRET,
            algorithm=settings.JWT_ALGORITHM,
        )

        # WebSocket disconnects immediately after the first loop iteration
        ws = AsyncMock()
        ws.receive_text = AsyncMock(side_effect=WebSocketDisconnect())

        mock_pubsub = AsyncMock()
        mock_pubsub.get_message = AsyncMock(return_value=None)
        mock_redis_instance = AsyncMock()
        mock_redis_instance.pubsub = MagicMock(return_value=mock_pubsub)

        with patch("core.routes.ws_routes.AsyncRedis") as mock_redis_class:
            mock_redis_class.from_url.return_value = mock_redis_instance
            await submission_status_ws(ws, str(draft_submission.id), token=token)

        ws.accept.assert_called_once()
        ws.send_json.assert_called_once()
        sent = ws.send_json.call_args[0][0]
        assert sent["type"] == "status"
        assert sent["submission_id"] == str(draft_submission.id)
        assert sent["status"] == draft_submission.status.value
