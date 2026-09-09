"""Documents ORM models and Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import json as _json

from pydantic import BaseModel, field_validator
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# Document
# ─────────────────────────────────────────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    file_name: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(32), nullable=False)   # pdf/docx/xlsx/pptx/csv
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    uploader_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    division: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    project: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    doc_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # proposal/mou/…
    confidentiality: Mapped[str] = mapped_column(String(50), default="INTERNAL")  # PUBLIC/INTERNAL/CONFIDENTIAL

    is_scanned: Mapped[bool] = mapped_column(Boolean, default=False)
    ocr_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=0)

    is_indexed: Mapped[bool] = mapped_column(Boolean, default=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # JSON-encoded strings
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)        # e.g. '["tender","2024"]'
    ai_abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_entities: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # JSON

    # Relationships
    versions: Mapped[List["DocumentVersion"]] = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan")
    chunks: Mapped[List["Chunk"]] = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# DocumentVersion
# ─────────────────────────────────────────────────────────────────────────────

class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    changed_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    change_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    document: Mapped["Document"] = relationship("Document", back_populates="versions")


# ─────────────────────────────────────────────────────────────────────────────
# Chunk
# ─────────────────────────────────────────────────────────────────────────────

class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    section_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    document: Mapped["Document"] = relationship("Document", back_populates="chunks")


# ─────────────────────────────────────────────────────────────────────────────
# HRRecord
# ─────────────────────────────────────────────────────────────────────────────

class HRRecord(Base):
    __tablename__ = "hr_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    qualifications: Mapped[str] = mapped_column(Text, nullable=False, default="")
    years_experience: Mapped[float] = mapped_column(Float, default=0.0)
    current_bandwidth_pct: Mapped[float] = mapped_column(Float, default=100.0)
    project_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    availability_date: Mapped[Optional[date]] = mapped_column(nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ingested_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    title: str
    file_name: str
    file_type: str
    file_size_bytes: int
    uploader_id: int
    division: Optional[str]
    project: Optional[str]
    doc_type: Optional[str]
    confidentiality: str
    is_scanned: bool
    ocr_confidence: Optional[float]
    page_count: int
    is_indexed: bool
    current_version: int
    created_at: datetime
    tags: List[str]
    ai_abstract: Optional[str]

    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v: object) -> List[str]:
        if v is None:
            return []
        if isinstance(v, list):
            return v
        try:
            parsed = _json.loads(v)  # type: ignore[arg-type]
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []


class DocumentVersionOut(BaseModel):
    id: int
    document_id: str
    version_number: int
    file_path: str
    changed_by: int
    created_at: datetime
    change_note: Optional[str]

    model_config = {"from_attributes": True}


class ChunkOut(BaseModel):
    id: str
    document_id: str
    chunk_index: int
    text: str
    page_number: Optional[int]
    section_title: Optional[str]
    token_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class HRRecordOut(BaseModel):
    id: int
    employee_id: str
    name: str
    qualifications: str
    years_experience: float
    current_bandwidth_pct: float
    project_history: Optional[str]
    availability_date: Optional[date]
    location: Optional[str]
    ingested_at: datetime
    ingested_by: int

    model_config = {"from_attributes": True}


class DocumentSearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None


class DocumentSearchResult(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    score: float
    text: str
    page_number: Optional[int]
    section_title: Optional[str]
