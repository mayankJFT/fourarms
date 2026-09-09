"""Document management endpoints."""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from pathlib import Path
from typing import List, Optional

import aiofiles
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.audit.logger import log_event
from app.auth.jwt_utils import get_current_active_user
from app.auth.models import User
from app.auth.rbac import SUPER_ADMIN, BOARD_ADMIN, TENDER_AUTHOR, require_role
from app.config import settings
from app.database import get_db
from app.documents.models import (
    Chunk,
    Document,
    DocumentOut,
    DocumentSearchRequest,
    DocumentSearchResult,
    DocumentVersion,
    DocumentVersionOut,
    HRRecord,
    HRRecordOut,
)

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
    "text/csv": "csv",
}


def _get_extension(filename: str, content_type: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext:
        return ext
    return ALLOWED_TYPES.get(content_type, "bin")


async def _save_upload(file: UploadFile, dest_path: str) -> tuple[int, str]:
    """Save uploaded file to disk, return (size_bytes, sha256_hex)."""
    sha = hashlib.sha256()
    size = 0
    async with aiofiles.open(dest_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            sha.update(chunk)
            size += len(chunk)
            await f.write(chunk)
    return size, sha.hexdigest()


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    request: Request,
    title: Optional[str] = Query(None),
    division: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    confidentiality: str = Query("INTERNAL"),
    tags: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    ext = _get_extension(file.filename or "", file.content_type or "")
    doc_id = str(uuid.uuid4())
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest_filename = f"{doc_id}.{ext}"
    dest_path = str(upload_dir / dest_filename)

    size, content_hash = await _save_upload(file, dest_path)

    # Check for duplicate by hash
    existing = db.query(Document).filter(Document.content_hash == content_hash).first()
    if existing:
        os.remove(dest_path)
        return existing

    doc = Document(
        id=doc_id,
        title=title or file.filename or doc_id,
        file_name=file.filename or dest_filename,
        file_type=ext,
        file_size_bytes=size,
        content_hash=content_hash,
        uploader_id=current_user.id,
        division=division or current_user.division,
        project=project,
        doc_type=doc_type,
        confidentiality=confidentiality,
        tags=tags,
        current_version=1,
    )
    db.add(doc)

    version = DocumentVersion(
        document_id=doc_id,
        version_number=1,
        file_path=dest_path,
        changed_by=current_user.id,
        change_note="Initial upload",
    )
    db.add(version)
    db.commit()
    db.refresh(doc)

    # Background ingestion — pass only plain values; ingest_document opens its own session
    from app.documents.ingestion import ingest_document
    background_tasks.add_task(ingest_document, dest_path, doc_id)

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_UPLOAD",
        resource_type="Document",
        resource_id=doc_id,
        detail={"file_name": file.filename, "size": size},
        ip_address=request.client.host if request.client else None,
    )
    return doc


# ── List documents ────────────────────────────────────────────────────────────

@router.get("", response_model=List[DocumentOut])
async def list_documents(
    division: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    confidentiality: Optional[str] = Query(None),
    is_indexed: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    q = db.query(Document)

    # RBAC filter
    if current_user.role not in (SUPER_ADMIN, BOARD_ADMIN):
        # Standard users / Tender Authors see own + public/internal in their division
        q = q.filter(
            (Document.uploader_id == current_user.id)
            | (Document.confidentiality.in_(["PUBLIC", "INTERNAL"]))
        )
        if current_user.division:
            q = q.filter(
                (Document.uploader_id == current_user.id)
                | (Document.division == current_user.division)
                | (Document.confidentiality == "PUBLIC")
            )

    if division:
        q = q.filter(Document.division == division)
    if doc_type:
        q = q.filter(Document.doc_type == doc_type)
    if confidentiality:
        q = q.filter(Document.confidentiality == confidentiality)
    if is_indexed is not None:
        q = q.filter(Document.is_indexed == is_indexed)

    offset = (page - 1) * limit
    return q.order_by(Document.created_at.desc()).offset(offset).limit(limit).all()


# ── Get document ──────────────────────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


# ── Download document ─────────────────────────────────────────────────────────

@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    version = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_number.desc())
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="No file found for document")

    if not os.path.exists(version.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_DOWNLOAD",
        resource_type="Document",
        resource_id=doc_id,
        ip_address=request.client.host if request.client else None,
    )
    return FileResponse(version.file_path, filename=doc.file_name)


# ── Delete document ───────────────────────────────────────────────────────────

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Only uploader or admin can delete
    if doc.uploader_id != current_user.id and current_user.role not in (SUPER_ADMIN, BOARD_ADMIN):
        raise HTTPException(status_code=403, detail="Not authorised to delete this document")

    # Remove from Pinecone
    from app.documents.pinecone_client import pinecone_client
    pinecone_client.delete_document_chunks(doc_id)

    # Remove file(s) from disk
    for version in doc.versions:
        try:
            if os.path.exists(version.file_path):
                os.remove(version.file_path)
        except Exception:
            pass

    db.delete(doc)
    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_DELETE",
        resource_type="Document",
        resource_id=doc_id,
        ip_address=request.client.host if request.client else None,
    )


# ── Document versions ─────────────────────────────────────────────────────────

@router.get("/{doc_id}/versions", response_model=List[DocumentVersionOut])
async def get_versions(
    doc_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_number.asc())
        .all()
    )


# ── Semantic search ───────────────────────────────────────────────────────────

@router.post("/search", response_model=List[DocumentSearchResult])
async def search_documents(
    body: DocumentSearchRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    from app.auth.rbac import build_pinecone_filter
    from app.documents.ingestion import get_embedding_model
    from app.documents.pinecone_client import pinecone_client

    model = get_embedding_model()
    embedding = model.encode([body.query])[0].tolist()
    filter_dict = build_pinecone_filter(current_user)

    # Merge user-supplied filters
    if body.filters:
        if filter_dict:
            filter_dict = {"$and": [filter_dict, body.filters]}
        else:
            filter_dict = body.filters

    matches = pinecone_client.query_chunks(embedding, filter_dict, top_k=20)
    results = []
    for m in matches:
        meta = m.get("metadata", {})
        doc_id = meta.get("document_id", "")
        doc = db.query(Document).filter(Document.id == doc_id).first()
        results.append(
            DocumentSearchResult(
                chunk_id=m["id"],
                document_id=doc_id,
                document_title=meta.get("document_title", doc.title if doc else ""),
                score=m.get("score", 0.0),
                text=meta.get("text_preview", ""),
                page_number=meta.get("page_number"),
                section_title=meta.get("section_title"),
            )
        )
    return results


# ── HR upload ─────────────────────────────────────────────────────────────────

@router.post("/hr/upload")
async def upload_hr_csv(
    file: UploadFile,
    request: Request,
    current_user: User = Depends(require_role(SUPER_ADMIN, BOARD_ADMIN, TENDER_AUTHOR)),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted for HR upload")

    upload_dir = Path(settings.UPLOAD_DIR) / "hr"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest_path = str(upload_dir / f"hr_{uuid.uuid4()}.csv")

    size, _ = await _save_upload(file, dest_path)

    from app.documents.hr_module import ingest_hr_csv

    try:
        count = ingest_hr_csv(dest_path, current_user.id, db)
    except ValueError as exc:
        os.remove(dest_path)
        raise HTTPException(status_code=400, detail=str(exc))

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="HR_CSV_UPLOAD",
        resource_type="HRRecord",
        detail={"file": file.filename, "records": count},
        ip_address=request.client.host if request.client else None,
    )
    return {"status": "ok", "records_processed": count}


# ── HR records list ───────────────────────────────────────────────────────────

@router.get("/hr/records", response_model=List[HRRecordOut])
async def list_hr_records(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role(SUPER_ADMIN, BOARD_ADMIN, TENDER_AUTHOR)),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * limit
    return db.query(HRRecord).offset(offset).limit(limit).all()
