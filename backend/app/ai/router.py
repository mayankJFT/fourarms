"""AI endpoints: chat, voice transcription, summarisation, document generation."""

from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.ai.models import (
    ChatRequest,
    ChatResponse,
    ConversationDetailOut,
    ConversationMessageOut,
    ConversationSession,
    ConversationSessionOut,
    DocumentTemplate,
    DocumentTemplateOut,
    GenerateRequest,
    SummariseMultiRequest,
    SummariseRequest,
)
from app.ai.rag import run_rag_pipeline
from app.ai.summariser import summarise_document, summarise_multiple
from app.audit.logger import log_event
from app.auth.jwt_utils import get_current_active_user
from app.auth.models import User
from app.auth.rbac import SUPER_ADMIN, require_role
from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    return await run_rag_pipeline(
        query=body.query,
        user=current_user,
        db=db,
        conversation_id=body.conversation_id,
        scope_doc_ids=body.scope_doc_ids,
    )


# ── List conversations ────────────────────────────────────────────────────────

@router.get("/conversations", response_model=List[ConversationSessionOut])
async def list_conversations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    is_super_admin = current_user.role == SUPER_ADMIN
    q = db.query(ConversationSession)
    if not is_super_admin:
        q = q.filter(ConversationSession.user_id == current_user.id)
    sessions = (
        q.order_by(ConversationSession.updated_at.desc())
        .limit(200 if is_super_admin else 50)
        .all()
    )

    # Resolve owner emails so a SUPER_ADMIN browsing everyone's chats can tell whose is whose
    emails_by_user_id: dict[int, str] = {}
    if is_super_admin and sessions:
        user_ids = {s.user_id for s in sessions}
        emails_by_user_id = {
            u.id: u.email for u in db.query(User).filter(User.id.in_(user_ids)).all()
        }

    return [
        ConversationSessionOut(
            id=s.id,
            title=s.title,
            created_at=s.created_at,
            updated_at=s.updated_at,
            user_id=s.user_id,
            user_email=emails_by_user_id.get(s.user_id) if is_super_admin else None,
        )
        for s in sessions
    ]


# ── Get conversation detail ───────────────────────────────────────────────────

@router.get("/conversations/{conv_id}", response_model=ConversationDetailOut)
async def get_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    is_super_admin = current_user.role == SUPER_ADMIN
    q = db.query(ConversationSession).filter(ConversationSession.id == conv_id)
    if not is_super_admin:
        q = q.filter(ConversationSession.user_id == current_user.id)
    session = q.first()
    if not session:
        raise HTTPException(status_code=404, detail="Conversation not found")

    owner_email = None
    if is_super_admin:
        owner = db.query(User).filter(User.id == session.user_id).first()
        owner_email = owner.email if owner else None

    return ConversationDetailOut(
        session=ConversationSessionOut(
            id=session.id,
            title=session.title,
            created_at=session.created_at,
            updated_at=session.updated_at,
            user_id=session.user_id,
            user_email=owner_email,
        ),
        messages=[ConversationMessageOut.model_validate(m) for m in session.messages],
    )


# ── Delete conversation ───────────────────────────────────────────────────────

@router.delete("/conversations/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.id == conv_id,
            ConversationSession.user_id == current_user.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(session)
    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="CONVERSATION_DELETE",
        resource_type="ConversationSession",
        resource_id=conv_id,
    )


# ── Summarise single document ─────────────────────────────────────────────────

@router.post("/summarise", response_model=ChatResponse)
async def summarise(
    body: SummariseRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    return await summarise_document(
        doc_id=body.document_id,
        length=body.length,
        user=current_user,
        db=db,
    )


# ── Summarise multiple documents ──────────────────────────────────────────────

@router.post("/summarise/multi", response_model=ChatResponse)
async def summarise_multi(
    body: SummariseMultiRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    return await summarise_multiple(
        doc_ids=body.document_ids,
        query=body.query,
        user=current_user,
        db=db,
    )


# ── Voice transcription (Deepgram) ───────────────────────────────────────────

@router.post("/transcribe", tags=["ai", "voice"])
async def transcribe_voice(
    audio: UploadFile = File(..., description="Audio file (wav, mp3, webm, m4a, ogg)"),
    language: Optional[str] = Form(None, description="Language hint: en | hi | hi-Latn"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Transcribe audio input using Deepgram.

    Supports English, Hindi, and Hinglish (hi-Latn).
    The transcript is returned for user confirmation before being sent
    to the RAG pipeline via the /ai/chat endpoint.

    Returns:
        transcript: str — confirmed text ready for /ai/chat
        confidence: float — 0.0–1.0 transcription confidence
        detected_language: str — language code detected by Deepgram
    """
    from app.ai.voice import transcribe_upload

    max_size_bytes = 25 * 1024 * 1024  # 25 MB
    audio_bytes = await audio.read()

    if len(audio_bytes) > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail="Audio file exceeds 25 MB limit.",
        )

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    try:
        result = await transcribe_upload(
            file_bytes=audio_bytes,
            filename=audio.filename or "audio.wav",
            language=language,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="VOICE_TRANSCRIBE",
        resource_type="audio",
        detail={
            "language_hint": language,
            "detected_language": result["detected_language"],
            "confidence": result["confidence"],
            "char_count": len(result["transcript"]),
        },
    )

    return {
        "transcript": result["transcript"],
        "confidence": result["confidence"],
        "detected_language": result["detected_language"],
    }


# ── Generate document ─────────────────────────────────────────────────────────

@router.post("/generate")
async def generate(
    body: GenerateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    from app.ai.generator import generate_document
    from app.workflow.models import GeneratedDocumentOut

    gen_doc = await generate_document(
        doc_type=body.doc_type,
        template_variant=body.template_variant,
        inputs=body.inputs,
        user=current_user,
        db=db,
        template_id=body.template_id,
    )
    return GeneratedDocumentOut.model_validate(gen_doc)


# ── Document generation templates ───────────────────────────────────────────────
# Users upload a reference document per generation category (Proposal / MOU /
# Agreement / Work Order); the AI mimics its structure/format — see
# app.ai.generator.generate_document's FORMAT TO MIMIC block.

_TEMPLATE_DOC_TYPES = {"PROPOSAL", "MOU", "AGREEMENT", "WORK_ORDER"}
_TEMPLATE_ALLOWED_EXT = {"pdf", "docx"}


def _template_to_out(template) -> DocumentTemplateOut:
    try:
        outline = json.loads(template.outline_json or "[]")
    except json.JSONDecodeError:
        outline = []
    return DocumentTemplateOut(
        id=template.id,
        doc_type=template.doc_type,
        title=template.title,
        file_name=template.file_name,
        file_type=template.file_type,
        outline=outline,
        uploaded_by=template.uploaded_by,
        created_at=template.created_at,
    )


@router.post("/templates", response_model=DocumentTemplateOut, status_code=status.HTTP_201_CREATED)
async def upload_template(
    doc_type: str = Form(...),
    title: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    """Upload a reference document for a generation category. Its structure
    (section headings + content) is extracted immediately and stored so future
    generations in that category can mimic its format."""
    doc_type = doc_type.upper()
    if doc_type not in _TEMPLATE_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"doc_type must be one of {sorted(_TEMPLATE_DOC_TYPES)}",
        )

    ext = Path(file.filename or "").suffix.lower().lstrip(".")
    if ext not in _TEMPLATE_ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Templates must be a .docx or .pdf file",
        )

    template_id = str(uuid.uuid4())
    upload_dir = Path(settings.UPLOAD_DIR) / "templates"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest_path = str(upload_dir / f"{template_id}.{ext}")

    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    # Reuse the same extractors document ingestion uses (heading-aware chunking,
    # tables as HTML) so the mimicked structure is as faithful as possible. They
    # write a few informational fields (page_count etc.) onto a Document instance
    # as a side effect — construct one in memory only, never persisted.
    from app.documents.ingestion import _extract_docx, _extract_pdf
    from app.documents.models import Document as _DocModel

    dummy = _DocModel(
        uploader_id=current_user.id,
        title=title or file.filename or "template",
        file_name=file.filename or f"{template_id}.{ext}",
        file_type=ext,
    )
    try:
        pages_data = _extract_pdf(dest_path, dummy) if ext == "pdf" else _extract_docx(dest_path, dummy)
    except Exception as exc:
        os.remove(dest_path)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not read template file: {exc}",
        ) from exc

    if not pages_data:
        os.remove(dest_path)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No extractable text found in this template.",
        )

    seen_headings: set[str] = set()
    outline: List[str] = []
    for p in pages_data:
        heading = p.get("section_title")
        if heading and not p.get("is_table") and heading not in seen_headings:
            seen_headings.add(heading)
            outline.append(heading)

    content_parts = []
    for p in pages_data:
        heading = p.get("section_title") or ""
        content_parts.append(f"## {heading}\n{p['text']}" if heading else p["text"])
    # Capped so a large template doesn't blow out the generation prompt's context budget.
    content_text = "\n\n".join(content_parts)[:12000]

    template = DocumentTemplate(
        id=template_id,
        doc_type=doc_type,
        title=title or file.filename or "Untitled Template",
        file_name=file.filename or f"{template_id}.{ext}",
        file_path=dest_path,
        file_type=ext,
        outline_json=json.dumps(outline),
        content_text=content_text,
        uploaded_by=current_user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="TEMPLATE_UPLOAD",
        resource_type="DocumentTemplate",
        resource_id=template.id,
        detail={"doc_type": doc_type, "title": template.title, "sections": len(outline)},
    )

    return _template_to_out(template)


@router.get("/templates", response_model=List[DocumentTemplateOut])
async def list_templates(
    doc_type: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List uploaded templates, optionally filtered by generation category.
    Available to any authenticated user so the generate flow can show what's
    available; only SUPER_ADMIN can upload/delete."""
    query = db.query(DocumentTemplate)
    if doc_type:
        query = query.filter(DocumentTemplate.doc_type == doc_type.upper())
    templates = query.order_by(DocumentTemplate.created_at.desc()).all()
    return [_template_to_out(t) for t in templates]


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    current_user: User = Depends(require_role(SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    template = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    try:
        if os.path.exists(template.file_path):
            os.remove(template.file_path)
    except OSError:
        logger.warning("Could not remove template file %s", template.file_path)

    db.delete(template)
    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="TEMPLATE_DELETE",
        resource_type="DocumentTemplate",
        resource_id=template_id,
        detail={"doc_type": template.doc_type, "title": template.title},
    )
