"""Workflow endpoints for generated document lifecycle management."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.audit.logger import log_event
from app.auth.jwt_utils import get_current_active_user
from app.auth.models import User
from app.auth.rbac import BOARD_ADMIN, SUPER_ADMIN
from app.database import get_db
from app.workflow.models import (
    GeneratedDocument,
    GeneratedDocumentOut,
    GeneratedDocumentUpdate,
    TransitionRequest,
    WorkflowEvent,
    WorkflowEventOut,
)
from app.workflow.state_machine import workflow_fsm

router = APIRouter(prefix="/workflow", tags=["workflow"])


def _get_doc_or_404(doc_id: str, db: Session) -> GeneratedDocument:
    doc = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Generated document not found")
    return doc


def _assert_owner_or_admin(doc: GeneratedDocument, user: User) -> None:
    if doc.owner_id != user.id and user.role not in (SUPER_ADMIN, BOARD_ADMIN):
        raise HTTPException(status_code=403, detail="Not authorised to modify this document")


# ── List generated documents ──────────────────────────────────────────────────

@router.get("/documents", response_model=List[GeneratedDocumentOut])
async def list_documents(
    state: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    owner_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    q = db.query(GeneratedDocument)

    # RBAC: non-admins only see their own documents
    if current_user.role not in (SUPER_ADMIN, BOARD_ADMIN):
        q = q.filter(GeneratedDocument.owner_id == current_user.id)
    elif owner_id is not None:
        q = q.filter(GeneratedDocument.owner_id == owner_id)

    if state:
        q = q.filter(GeneratedDocument.state == state)
    if doc_type:
        q = q.filter(GeneratedDocument.doc_type == doc_type)

    offset = (page - 1) * limit
    return q.order_by(GeneratedDocument.created_at.desc()).offset(offset).limit(limit).all()


# ── Get single document ───────────────────────────────────────────────────────

@router.get("/documents/{doc_id}", response_model=GeneratedDocumentOut)
async def get_document(
    doc_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    _assert_owner_or_admin(doc, current_user)
    return doc


# ── Update document content (DRAFT only, owner only) ─────────────────────────

@router.put("/documents/{doc_id}", response_model=GeneratedDocumentOut)
async def update_document(
    doc_id: str,
    body: GeneratedDocumentUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    _assert_owner_or_admin(doc, current_user)

    if doc.state != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT documents can be edited")

    if body.title is not None:
        doc.title = body.title
    if body.content_json is not None:
        # Validate it's valid JSON
        try:
            json.loads(body.content_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="content_json must be valid JSON")
        doc.content_json = body.content_json

    db.commit()
    db.refresh(doc)
    return doc


# ── Delete a generated document (owner or admin, any state) ──────────────────

@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    _assert_owner_or_admin(doc, current_user)

    # WorkflowEvent rows FK to this document — clear them first so the delete
    # doesn't leave orphaned/dangling history rows behind.
    db.query(WorkflowEvent).filter(WorkflowEvent.document_id == doc_id).delete(synchronize_session=False)
    db.delete(doc)
    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_DELETE",
        resource_type="GeneratedDocument",
        resource_id=doc_id,
        detail={"doc_type": doc.doc_type, "title": doc.title},
    )


# ── Submit for review (DRAFT → REVIEW) ───────────────────────────────────────

@router.post("/documents/{doc_id}/submit", response_model=GeneratedDocumentOut)
async def submit_for_review(
    doc_id: str,
    body: TransitionRequest = TransitionRequest(),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    _assert_owner_or_admin(doc, current_user)
    return workflow_fsm.transition(doc, "REVIEW", current_user, body.comment, db)


# ── Approve (REVIEW → APPROVED) ──────────────────────────────────────────────

@router.post("/documents/{doc_id}/approve", response_model=GeneratedDocumentOut)
async def approve_document(
    doc_id: str,
    body: TransitionRequest = TransitionRequest(),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    return workflow_fsm.transition(doc, "APPROVED", current_user, body.comment, db)


# ── Request revision (REVIEW → DRAFT) ────────────────────────────────────────

@router.post("/documents/{doc_id}/revise", response_model=GeneratedDocumentOut)
async def request_revision(
    doc_id: str,
    body: TransitionRequest = TransitionRequest(),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    return workflow_fsm.transition(doc, "DRAFT", current_user, body.comment, db)


# ── Export to DOCX ────────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/export")
async def export_document(
    doc_id: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    _assert_owner_or_admin(doc, current_user)

    from app.ai.generator import export_to_docx

    buffer = export_to_docx(doc)

    # Record export timestamp
    doc.exported_at = datetime.now(timezone.utc)
    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_EXPORT",
        resource_type="GeneratedDocument",
        resource_id=doc_id,
        detail={"title": doc.title},
        ip_address=request.client.host if request.client else None,
    )

    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in doc.title)[:80]
    filename = f"{safe_title}.docx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Workflow history ──────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/history", response_model=List[WorkflowEventOut])
async def get_history(
    doc_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(doc_id, db)
    _assert_owner_or_admin(doc, current_user)

    return (
        db.query(WorkflowEvent)
        .filter(WorkflowEvent.document_id == doc_id)
        .order_by(WorkflowEvent.timestamp.asc())
        .all()
    )
