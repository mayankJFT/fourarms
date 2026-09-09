"""AI conversation ORM models and Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# ORM Models
# ─────────────────────────────────────────────────────────────────────────────

class ConversationSession(Base):
    __tablename__ = "conversation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False, default="New conversation")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    messages: Mapped[List["ConversationMessage"]] = relationship(
        "ConversationMessage", back_populates="session", cascade="all, delete-orphan"
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversation_sessions.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user / assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)      # JSON
    guardrail_outcome: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped["ConversationSession"] = relationship("ConversationSession", back_populates="messages")


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────

class Citation(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    page_number: Optional[int]
    section_title: Optional[str]
    passage: str


class CitedResponse(BaseModel):
    answer_text: str
    citations: List[Citation]
    outcome: str


class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[str] = None
    scope_doc_ids: Optional[List[str]] = None


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    citations: List[Citation]
    outcome: str  # OK / NO_INFO / ACCESS_DENIED / INSUFFICIENT_CONTEXT


class ConversationSessionOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationMessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    citations: Optional[str]
    guardrail_outcome: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailOut(BaseModel):
    session: ConversationSessionOut
    messages: List[ConversationMessageOut]


class SummariseRequest(BaseModel):
    document_id: str
    length: str = "medium"  # short / medium / long


class SummariseMultiRequest(BaseModel):
    document_ids: List[str]
    query: str = "Summarise these documents"


class GenerateRequest(BaseModel):
    doc_type: str                         # proposal / mou / agreement / work_order
    template_variant: int = 1
    inputs: Dict[str, Any] = {}
