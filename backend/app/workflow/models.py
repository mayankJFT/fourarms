"""Workflow ORM models and Pydantic schemas for generated documents."""

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

class GeneratedDocument(Base):
    __tablename__ = "generated_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False)           # proposal/mou/agreement/work_order
    template_variant: Mapped[int] = mapped_column(Integer, default=1)
    template_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # DocumentTemplate whose format was mimicked, if any
    content_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # Structured content
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")  # DRAFT/REVIEW/APPROVED
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    reviewer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    exported_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source_citations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    events: Mapped[List["WorkflowEvent"]] = relationship(
        "WorkflowEvent", back_populates="document", cascade="all, delete-orphan"
    )


class WorkflowEvent(Base):
    __tablename__ = "workflow_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("generated_documents.id"), nullable=False)
    from_state: Mapped[str] = mapped_column(String(20), nullable=False)
    to_state: Mapped[str] = mapped_column(String(20), nullable=False)
    triggered_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    document: Mapped["GeneratedDocument"] = relationship("GeneratedDocument", back_populates="events")


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────

class GeneratedDocumentOut(BaseModel):
    id: str
    title: str
    doc_type: str
    template_variant: int
    template_id: Optional[str] = None
    content_json: str
    state: str
    owner_id: int
    reviewer_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    exported_at: Optional[datetime]
    source_citations: Optional[str]

    model_config = {"from_attributes": True}


class GeneratedDocumentUpdate(BaseModel):
    title: Optional[str] = None
    content_json: Optional[str] = None


class WorkflowEventOut(BaseModel):
    id: int
    document_id: str
    from_state: str
    to_state: str
    triggered_by: int
    comment: Optional[str]
    timestamp: datetime

    model_config = {"from_attributes": True}


class TransitionRequest(BaseModel):
    comment: Optional[str] = None
