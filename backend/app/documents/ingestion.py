"""Document ingestion pipeline: extract → chunk → embed → upsert to Pinecone."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from app.config import settings
from app.documents.chunker import chunk_text
from app.documents.models import Chunk, Document
from app.documents.ocr import is_scanned_pdf, ocr_pdf_pages
from app.documents.pinecone_client import pinecone_client

logger = logging.getLogger(__name__)

# ── Embedding model singleton ─────────────────────────────────────────────────

_embedding_model = None


def get_embedding_model():
    """Lazy-load and cache the SentenceTransformer model."""
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


# ── Text extractors ───────────────────────────────────────────────────────────

def _extract_pdf(file_path: str, document: Document) -> List[dict]:
    """Return list of {text, page_number, section_title} dicts from a PDF."""
    pages_data = []

    scanned = is_scanned_pdf(file_path)
    document.is_scanned = scanned

    if scanned:
        ocr_results = ocr_pdf_pages(file_path)
        confidences = []
        for page_num, text, conf in ocr_results:
            pages_data.append({"text": text, "page_number": page_num, "section_title": None})
            if conf > 0:
                confidences.append(conf)
        document.ocr_confidence = (
            sum(confidences) / len(confidences) if confidences else 0.0
        )
        document.page_count = len(ocr_results)
    else:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            document.page_count = len(pdf.pages)
            for page_num, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                pages_data.append({"text": text, "page_number": page_num, "section_title": None})

    return pages_data


def _extract_docx(file_path: str, document: Document) -> List[dict]:
    """Extract paragraphs from a DOCX file, detecting headings as section titles."""
    from docx import Document as DocxDocument

    doc = DocxDocument(file_path)
    pages_data = []
    current_section: Optional[str] = None
    buffer: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style_name = para.style.name.lower() if para.style else ""
        if "heading" in style_name:
            if buffer:
                pages_data.append({
                    "text": " ".join(buffer),
                    "page_number": None,
                    "section_title": current_section,
                })
                buffer = []
            current_section = text
        else:
            buffer.append(text)

    if buffer:
        pages_data.append({
            "text": " ".join(buffer),
            "page_number": None,
            "section_title": current_section,
        })
    return pages_data


def _extract_xlsx(file_path: str, document: Document) -> List[dict]:
    """Extract all sheet content from an XLSX file as text."""
    import openpyxl

    wb = openpyxl.load_workbook(file_path, data_only=True)
    pages_data = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows_text = []
        for row in ws.iter_rows(values_only=True):
            row_str = "\t".join(str(cell) if cell is not None else "" for cell in row)
            if row_str.strip():
                rows_text.append(row_str)
        if rows_text:
            pages_data.append({
                "text": "\n".join(rows_text),
                "page_number": None,
                "section_title": sheet_name,
            })
    return pages_data


def _extract_pptx(file_path: str, document: Document) -> List[dict]:
    """Extract text from each slide of a PPTX file."""
    from pptx import Presentation

    prs = Presentation(file_path)
    pages_data = []
    for slide_num, slide in enumerate(prs.slides, start=1):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = " ".join(run.text for run in para.runs).strip()
                    if line:
                        texts.append(line)
        if texts:
            pages_data.append({
                "text": " ".join(texts),
                "page_number": slide_num,
                "section_title": f"Slide {slide_num}",
            })
    return pages_data


# ── Main ingestion function ───────────────────────────────────────────────────

async def ingest_document(file_path: str, document_id: str) -> None:
    """
    Full ingestion pipeline for a single document.

    Opens its own DB session so it is not affected by the request-scoped
    session closing when the upload response is returned.

    Steps:
    1. Detect file type and extract text
    2. Chunk extracted text
    3. Embed chunks with SentenceTransformer
    4. Upsert to Pinecone
    5. Save Chunk records to SQLite
    6. Mark document.is_indexed = True
    """
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            logger.error("ingest_document: document %s not found in DB", document_id)
            return

        logger.info("Starting ingestion for document %s (%s)", document.id, document.file_type)

        # Step 1: Extract text
        ft = (document.file_type or "").lower().lstrip(".")
        pages_data: List[dict] = []

        if ft == "pdf":
            pages_data = _extract_pdf(file_path, document)
        elif ft in ("docx", "doc"):
            pages_data = _extract_docx(file_path, document)
        elif ft in ("xlsx", "xls"):
            pages_data = _extract_xlsx(file_path, document)
        elif ft in ("pptx", "ppt"):
            pages_data = _extract_pptx(file_path, document)
        else:
            with open(file_path, "r", errors="replace") as f:
                raw = f.read()
            pages_data = [{"text": raw, "page_number": None, "section_title": None}]

        # Step 2: Chunk
        all_chunks: List[dict] = []
        for page in pages_data:
            for chunk in chunk_text(
                page["text"],
                page_number=page.get("page_number"),
                section_title=page.get("section_title"),
            ):
                all_chunks.append(chunk)

        if not all_chunks:
            logger.warning("No chunks extracted for document %s", document.id)
            document.is_indexed = True
            db.commit()
            db.close()
            return

        # Step 3: Embed
        model = get_embedding_model()
        texts = [c["text"] for c in all_chunks]
        embeddings = model.encode(texts, batch_size=32, show_progress_bar=False)

        # Step 4 & 5: Build Pinecone records and SQLite Chunk rows
        upload_date = document.created_at.isoformat() if document.created_at else datetime.now(timezone.utc).isoformat()
        pinecone_vectors: List[dict] = []
        db_chunks: List[Chunk] = []

        for i, (chunk, embedding) in enumerate(zip(all_chunks, embeddings)):
            chunk_id = str(uuid.uuid4())

            # Pinecone record
            vector_record = {
                "id": chunk_id,
                "values": embedding.tolist(),
                "metadata": {
                    "document_id": document.id,
                    "owner_user_id": str(document.uploader_id),
                    "division": document.division or "",
                    "project": document.project or "",
                    "confidentiality": document.confidentiality,
                    "doc_type": document.doc_type or "",
                    "is_hr_data": False,
                    "chunk_index": chunk["chunk_index"],
                    "page_number": chunk.get("page_number") or 0,
                    "section_title": chunk.get("section_title") or "",
                    "text_preview": chunk["text"][:200],
                    "file_type": ft,
                    "is_scanned": document.is_scanned,
                    "ocr_confidence": document.ocr_confidence or 0.0,
                    "upload_date": upload_date,
                    "version": document.current_version,
                    "document_title": document.title,
                },
            }
            pinecone_vectors.append(vector_record)

            # SQLite Chunk record
            db_chunks.append(
                Chunk(
                    id=chunk_id,
                    document_id=document.id,
                    chunk_index=chunk["chunk_index"],
                    text=chunk["text"],
                    page_number=chunk.get("page_number"),
                    section_title=chunk.get("section_title"),
                    token_count=chunk["token_count"],
                )
            )

        # Upsert to Pinecone
        pinecone_client.upsert_chunks(pinecone_vectors)

        # Save chunks to DB
        try:
            db.add_all(db_chunks)
            db.commit()
        except Exception as exc:
            logger.error("Failed to save chunks to DB for doc %s: %s", document.id, exc)
            db.rollback()

        # Step 6: Mark indexed
        document.is_indexed = True
        db.commit()
        logger.info(
            "Ingestion complete for document %s: %d chunks indexed",
            document.id,
            len(all_chunks),
        )

    except Exception as exc:
        logger.error("Ingestion failed for document %s: %s", document_id, exc, exc_info=True)
        db.rollback()
    finally:
        db.close()
