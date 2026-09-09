"""Finite state machine for generated document workflow."""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.audit.logger import log_event
from app.auth.models import User
from app.workflow.models import GeneratedDocument, WorkflowEvent

logger = logging.getLogger(__name__)

# (from_state, to_state) -> list of roles permitted to make this transition
TRANSITIONS: dict[Tuple[str, str], List[str]] = {
    ("DRAFT", "REVIEW"): ["STANDARD_USER", "BOARD_ADMIN", "SUPER_ADMIN", "TENDER_AUTHOR"],
    ("REVIEW", "APPROVED"): ["BOARD_ADMIN", "SUPER_ADMIN"],
    ("REVIEW", "DRAFT"): ["BOARD_ADMIN", "SUPER_ADMIN"],
}


class WorkflowFSM:
    """Validates and executes workflow state transitions."""

    def transition(
        self,
        doc: GeneratedDocument,
        to_state: str,
        user: User,
        comment: Optional[str],
        db: Session,
    ) -> GeneratedDocument:
        """
        Attempt to transition *doc* from its current state to *to_state*.

        Raises HTTPException (400/403) if the transition is not valid.
        Returns the updated document.
        """
        from_state = doc.state
        key = (from_state, to_state)

        allowed_roles = TRANSITIONS.get(key)
        if allowed_roles is None:
            raise HTTPException(
                status_code=400,
                detail=f"Transition '{from_state}' → '{to_state}' is not a valid workflow step.",
            )

        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Role '{user.role}' cannot perform the '{from_state}' → '{to_state}' transition. "
                    f"Required roles: {allowed_roles}"
                ),
            )

        # Record the event
        event = WorkflowEvent(
            document_id=doc.id,
            from_state=from_state,
            to_state=to_state,
            triggered_by=user.id,
            comment=comment,
        )
        db.add(event)

        # Update the document state
        doc.state = to_state
        db.commit()
        db.refresh(doc)

        # Audit log
        log_event(
            db=db,
            user_id=user.id,
            user_email=user.email,
            action="WORKFLOW_TRANSITION",
            resource_type="GeneratedDocument",
            resource_id=doc.id,
            detail={"from_state": from_state, "to_state": to_state, "comment": comment},
        )

        logger.info(
            "Document %s transitioned %s → %s by user %s",
            doc.id,
            from_state,
            to_state,
            user.id,
        )
        return doc


# Module-level singleton
workflow_fsm = WorkflowFSM()
