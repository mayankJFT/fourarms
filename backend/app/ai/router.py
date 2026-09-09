"""AI endpoints: chat, voice transcription, summarisation, document generation."""

from __future__ import annotations

import json
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
    GenerateRequest,
    SummariseMultiRequest,
    SummariseRequest,
)
from app.ai.rag import run_rag_pipeline
from app.ai.summariser import summarise_document, summarise_multiple
from app.audit.logger import log_event
from app.auth.jwt_utils import get_current_active_user
from app.auth.models import User
from app.database import get_db

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
    sessions = (
        db.query(ConversationSession)
        .filter(ConversationSession.user_id == current_user.id)
        .order_by(ConversationSession.updated_at.desc())
        .limit(50)
        .all()
    )
    return sessions


# ── Get conversation detail ───────────────────────────────────────────────────

@router.get("/conversations/{conv_id}", response_model=ConversationDetailOut)
async def get_conversation(
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

    return ConversationDetailOut(
        session=ConversationSessionOut.model_validate(session),
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
    )
    return GeneratedDocumentOut.model_validate(gen_doc)
