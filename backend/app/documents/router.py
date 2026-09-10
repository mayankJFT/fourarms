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
    CategoryUpdateRequest,
    Chunk,
    ChunkOut,
    Document,
    DocumentEditRequest,
    DocumentOut,
    DocumentSearchRequest,
    DocumentSearchResult,
    DocumentShare,
    DocumentShareOut,
    DocumentVersion,
    DocumentVersionOut,
    HRRecord,
    HRRecordOut,
    ShareRequest,
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


def _assert_can_view_document(doc: Document, current_user: User, db: Session) -> None:
    """SUPER_ADMIN and BOARD_ADMIN can view (read-only) any document; the uploader
    always can; everyone else only if the document was explicitly shared with them
    (see DocumentShare). Note: this governs repository browsing only — AI chat/RAG
    retrieval is scoped separately via build_pinecone_filter and does NOT extend to
    BOARD_ADMIN the same way."""
    if current_user.role in (SUPER_ADMIN, BOARD_ADMIN) or doc.uploader_id == current_user.id:
        return
    shared = (
        db.query(DocumentShare)
        .filter(DocumentShare.document_id == doc.id, DocumentShare.shared_with_user_id == current_user.id)
        .first()
    )
    if not shared:
        raise HTTPException(status_code=403, detail="Not authorised to access this document")


def _assert_can_manage_document(doc: Document, current_user: User) -> None:
    """Edit / delete / share / new-version are owner-or-SUPER_ADMIN only — a shared
    viewer cannot modify the document."""
    if current_user.role != SUPER_ADMIN and doc.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the uploader or a SUPER_ADMIN can modify this document")


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
    query: Optional[str] = Query(None, description="Free-text match against title, file name, and tags"),
    division: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    confidentiality: Optional[str] = Query(None),
    is_indexed: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    q = db.query(Document)

    # RBAC filter — SUPER_ADMIN and BOARD_ADMIN see every document regardless of
    # confidentiality, division, or category (read-only browsing for BOARD_ADMIN —
    # edit/delete/share still require ownership, see _assert_can_manage_document);
    # everyone else sees their own uploads plus anything explicitly shared with them.
    if current_user.role not in (SUPER_ADMIN, BOARD_ADMIN):
        shared_doc_ids = (
            db.query(DocumentShare.document_id)
            .filter(DocumentShare.shared_with_user_id == current_user.id)
            .subquery()
        )
        q = q.filter((Document.uploader_id == current_user.id) | (Document.id.in_(shared_doc_ids)))

    if query:
        like = f"%{query}%"
        q = q.filter(
            Document.title.ilike(like) | Document.file_name.ilike(like) | Document.tags.ilike(like)
        )
    if division:
        q = q.filter(Document.division == division)
    if project:
        q = q.filter(Document.project == project)
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
    _assert_can_view_document(doc, current_user, db)
    return doc


# ── Confirm / override AI-suggested category ────────────────────────────────────

@router.put("/{doc_id}/category", response_model=DocumentOut)
async def update_document_category(
    doc_id: str,
    body: CategoryUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Accept or override the AI-suggested category for a document."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _assert_can_manage_document(doc, current_user)

    category = body.category.strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category cannot be empty")

    doc.doc_type = category
    if body.detected_type_description is not None:
        doc.ai_detected_type = body.detected_type_description.strip() or None
    doc.category_confirmed = True
    db.commit()
    db.refresh(doc)

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_CATEGORY_CONFIRM",
        resource_type="Document",
        resource_id=doc_id,
        detail={"category": category},
        ip_address=request.client.host if request.client else None,
    )
    return doc


# ── Edit document metadata ──────────────────────────────────────────────────────

@router.put("/{doc_id}", response_model=DocumentOut)
async def edit_document(
    doc_id: str,
    body: DocumentEditRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Edit a document's title/division/project/confidentiality/tags. Owner or SUPER_ADMIN only."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _assert_can_manage_document(doc, current_user)

    before = {
        "title": doc.title, "division": doc.division, "project": doc.project,
        "confidentiality": doc.confidentiality, "tags": doc.tags,
    }

    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        doc.title = title
    if body.division is not None:
        doc.division = body.division.strip() or None
    if body.project is not None:
        doc.project = body.project.strip() or None
    if body.confidentiality is not None:
        doc.confidentiality = body.confidentiality
    if body.tags is not None:
        doc.tags = json.dumps(body.tags)

    db.commit()
    db.refresh(doc)

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_EDIT",
        resource_type="Document",
        resource_id=doc_id,
        detail={"before": before, "after": body.model_dump(exclude_unset=True)},
        ip_address=request.client.host if request.client else None,
    )
    return doc


# ── Upload a new version ────────────────────────────────────────────────────────

@router.post("/{doc_id}/versions", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_new_version(
    doc_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    request: Request,
    change_note: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upload a new file as the next version of an existing document, preserving history."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _assert_can_manage_document(doc, current_user)

    ext = _get_extension(file.filename or "", file.content_type or "")
    next_version = doc.current_version + 1
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest_path = str(upload_dir / f"{doc_id}-v{next_version}.{ext}")

    size, content_hash = await _save_upload(file, dest_path)

    version = DocumentVersion(
        document_id=doc_id,
        version_number=next_version,
        file_path=dest_path,
        changed_by=current_user.id,
        change_note=change_note or f"Version {next_version}",
    )
    db.add(version)

    doc.current_version = next_version
    doc.file_name = file.filename or doc.file_name
    doc.file_type = ext
    doc.file_size_bytes = size
    doc.content_hash = content_hash
    doc.is_indexed = False
    doc.ingestion_error = None
    db.commit()
    db.refresh(doc)

    # Re-run ingestion against the new file — old chunks/vectors are purged first
    # so search results reflect only the current version.
    from app.documents.pinecone_client import pinecone_client
    pinecone_client.delete_document_chunks(doc_id)
    db.query(Chunk).filter(Chunk.document_id == doc_id).delete()
    db.commit()

    from app.documents.ingestion import ingest_document
    background_tasks.add_task(ingest_document, dest_path, doc_id)

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_VERSION_UPLOAD",
        resource_type="Document",
        resource_id=doc_id,
        detail={"version": next_version, "file_name": file.filename, "change_note": change_note},
        ip_address=request.client.host if request.client else None,
    )
    return doc


# ── Sharing ──────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/shares", response_model=List[DocumentShareOut])
async def list_shares(
    doc_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _assert_can_manage_document(doc, current_user)

    shares = db.query(DocumentShare).filter(DocumentShare.document_id == doc_id).all()
    out = []
    for s in shares:
        user = db.query(User).filter(User.id == s.shared_with_user_id).first()
        out.append(DocumentShareOut(
            id=s.id, document_id=s.document_id, shared_with_user_id=s.shared_with_user_id,
            shared_with_email=user.email if user else "(deleted user)",
            shared_by_user_id=s.shared_by_user_id, created_at=s.created_at,
        ))
    return out


@router.post("/{doc_id}/share", response_model=List[DocumentShareOut])
async def share_document(
    doc_id: str,
    body: ShareRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Grant one or more users read access to this document (list/view/download/chat over it)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _assert_can_manage_document(doc, current_user)

    granted: List[DocumentShareOut] = []
    not_found: List[str] = []
    for email in body.user_emails:
        email = email.strip().lower()
        if not email:
            continue
        target = db.query(User).filter(User.email == email).first()
        if not target:
            not_found.append(email)
            continue
        if target.id == doc.uploader_id:
            continue  # already the owner
        existing = (
            db.query(DocumentShare)
            .filter(DocumentShare.document_id == doc_id, DocumentShare.shared_with_user_id == target.id)
            .first()
        )
        if existing:
            granted.append(DocumentShareOut(
                id=existing.id, document_id=doc_id, shared_with_user_id=target.id,
                shared_with_email=target.email, shared_by_user_id=existing.shared_by_user_id,
                created_at=existing.created_at,
            ))
            continue
        share = DocumentShare(document_id=doc_id, shared_with_user_id=target.id, shared_by_user_id=current_user.id)
        db.add(share)
        db.flush()
        granted.append(DocumentShareOut(
            id=share.id, document_id=doc_id, shared_with_user_id=target.id,
            shared_with_email=target.email, shared_by_user_id=current_user.id, created_at=share.created_at,
        ))

    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_SHARE",
        resource_type="Document",
        resource_id=doc_id,
        detail={"shared_with": [g.shared_with_email for g in granted], "not_found": not_found},
        ip_address=request.client.host if request.client else None,
    )
    if not_found:
        # Still return what succeeded — the frontend surfaces not_found via the detail above
        pass
    return granted


@router.delete("/{doc_id}/share/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_document(
    doc_id: str,
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _assert_can_manage_document(doc, current_user)

    share = (
        db.query(DocumentShare)
        .filter(DocumentShare.document_id == doc_id, DocumentShare.shared_with_user_id == user_id)
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    target = db.query(User).filter(User.id == user_id).first()
    db.delete(share)
    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="DOCUMENT_UNSHARE",
        resource_type="Document",
        resource_id=doc_id,
        detail={"revoked_from": target.email if target else user_id},
        ip_address=request.client.host if request.client else None,
    )


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
    _assert_can_view_document(doc, current_user, db)

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


# ── Document content (chunks) ─────────────────────────────────────────────────

@router.get("/{doc_id}/content", response_model=List[ChunkOut])
async def get_document_content(
    doc_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _assert_can_view_document(doc, current_user, db)
    chunks = (
        db.query(Chunk)
        .filter(Chunk.document_id == doc_id)
        .order_by(Chunk.chunk_index)
        .all()
    )
    return chunks


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

    # Only the uploader or SUPER_ADMIN can delete
    _assert_can_manage_document(doc, current_user)

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

    # Shares are removed along with the document (no FK cascade configured — SQLite PoC)
    db.query(DocumentShare).filter(DocumentShare.document_id == doc_id).delete()

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
    _assert_can_view_document(doc, current_user, db)
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
    from app.documents.embeddings import embed_texts
    from app.documents.pinecone_client import pinecone_client

    embedding = embed_texts([body.query])[0]
    filter_dict = build_pinecone_filter(current_user, db)

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
    q = db.query(HRRecord)
    if current_user.role != SUPER_ADMIN:
        # Same ownership rule as documents: only the records this user personally uploaded
        q = q.filter(HRRecord.ingested_by == current_user.id)
    offset = (page - 1) * limit
    return q.offset(offset).limit(limit).all()
