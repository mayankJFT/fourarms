"""SUPER_ADMIN-only system administration endpoints."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai.models import ConversationMessage, ConversationSession
from app.audit.logger import log_event
from app.auth.jwt_utils import get_current_active_user
from app.auth.models import User
from app.auth.rbac import SUPER_ADMIN, require_role
from app.database import get_db
from app.documents.models import Chunk, Document, DocumentShare, DocumentVersion
from app.documents.pinecone_client import pinecone_client
from app.workflow.models import GeneratedDocument, WorkflowEvent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


class ResetAllResponse(BaseModel):
    documents_deleted: int
    chunks_deleted: int
    document_versions_deleted: int
    document_shares_deleted: int
    conversation_sessions_deleted: int
    conversation_messages_deleted: int
    generated_documents_deleted: int
    workflow_events_deleted: int
    files_deleted: int
    files_failed: int
    pinecone_cleared: bool
    detail: Dict[str, Any]


@router.post("/reset-all", response_model=ResetAllResponse)
async def reset_all(
    request: Request,
    current_user: User = Depends(require_role(SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    """
    Wipe the entire document repository, Pinecone index, chat history, and
    AI-generated documents. Irreversible.

    NOT deleted: user accounts, the audit log itself, and HR records (their
    Pinecone vectors ARE cleared along with everything else, so HR data becomes
    unsearchable via chat until the CSV is re-uploaded — the HR table rows
    themselves are left intact).
    """
    # Collect file paths before deleting the DB rows that reference them.
    file_paths = [v.file_path for v in db.query(DocumentVersion.file_path).all()]

    counts = {
        "chunks_deleted": db.query(Chunk).delete(synchronize_session=False),
        "document_versions_deleted": db.query(DocumentVersion).delete(synchronize_session=False),
        "document_shares_deleted": db.query(DocumentShare).delete(synchronize_session=False),
        "documents_deleted": db.query(Document).delete(synchronize_session=False),
        "conversation_messages_deleted": db.query(ConversationMessage).delete(synchronize_session=False),
        "conversation_sessions_deleted": db.query(ConversationSession).delete(synchronize_session=False),
        "workflow_events_deleted": db.query(WorkflowEvent).delete(synchronize_session=False),
        "generated_documents_deleted": db.query(GeneratedDocument).delete(synchronize_session=False),
    }
    db.commit()

    # Best-effort: clear Pinecone and delete files. SQL rows are already gone
    # regardless of whether these succeed — log failures rather than raising, so
    # a flaky Pinecone call doesn't leave the DB and vector store half-reset.
    pinecone_cleared = pinecone_client.delete_all_vectors()

    files_deleted = 0
    files_failed = 0
    for path in file_paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
                files_deleted += 1
        except Exception as exc:
            files_failed += 1
            logger.warning("reset_all: failed to delete file %s: %s", path, exc)

    detail = {**counts, "pinecone_cleared": pinecone_cleared, "files_deleted": files_deleted, "files_failed": files_failed}

    # The audit log is deliberately NOT wiped by this action — record that the
    # reset happened, by whom, and what it touched.
    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="SYSTEM_RESET_ALL",
        resource_type="System",
        resource_id=None,
        detail=detail,
        ip_address=request.client.host if request.client else None,
    )

    return ResetAllResponse(**counts, files_deleted=files_deleted, files_failed=files_failed, pinecone_cleared=pinecone_cleared, detail=detail)
