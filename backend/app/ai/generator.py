"""Document generation via RAG-augmented LLM calls, with DOCX export."""

from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.ai.groq_client import groq_client
from app.ai.rag import run_rag_pipeline
from app.audit.logger import log_event
from app.auth.models import User
from app.workflow.models import GeneratedDocument

logger = logging.getLogger(__name__)


async def generate_document(
    doc_type: str,
    template_variant: int,
    inputs: Dict[str, Any],
    user: User,
    db: Session,
) -> GeneratedDocument:
    """
    Generate a new document using RAG-sourced precedent clauses.

    Steps:
    1. Retrieve relevant precedent via RAG scoped to existing docs of *doc_type*
    2. Build a generation prompt with retrieved context + user inputs
    3. Call Groq to produce structured JSON sections
    4. Persist GeneratedDocument in SQLite
    5. Audit log the event
    """
    # ── Step 1: Retrieve precedent ────────────────────────────────────────────
    scope_query = f"precedent clauses for {doc_type} {inputs.get('scope', '')} {inputs.get('title', '')}"

    rag_response = await run_rag_pipeline(
        query=scope_query,
        user=user,
        db=db,
        conversation_id=None,
        scope_doc_ids=None,  # search all docs the user can access
    )

    precedent_text = rag_response.answer if rag_response.answer else ""
    citations_json = json.dumps([c.model_dump() for c in rag_response.citations])

    # ── Step 2: Build generation prompt ──────────────────────────────────────
    scope_str = inputs.get("scope", "")
    client_name = inputs.get("client_name", "Client")
    project_title = inputs.get("title", f"QCI {doc_type.capitalize()}")
    effective_date = inputs.get("effective_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    generation_system = (
        f"You are a professional contract and proposal writer for QCI (Queensland Construction Inspections). "
        f"Generate a complete {doc_type.replace('_', ' ').title()} document. "
        f"Use the precedent clauses below for guidance, then produce a fully structured document.\n\n"
        f"PRECEDENT CLAUSES:\n{precedent_text}\n\n"
        f"Output ONLY valid JSON with this schema:\n"
        "{\n"
        '  "title": "string",\n'
        '  "reference_number": "string",\n'
        '  "sections": [\n'
        '    {"heading": "string", "content": "string"}\n'
        "  ]\n"
        "}\n"
        "Do not include any text outside the JSON object."
    )

    user_instruction = (
        f"Generate a {doc_type.replace('_', ' ').title()} with the following details:\n"
        f"- Project/Scope: {scope_str}\n"
        f"- Client: {client_name}\n"
        f"- Title: {project_title}\n"
        f"- Effective Date: {effective_date}\n"
        + "\n".join(f"- {k}: {v}" for k, v in inputs.items()
                    if k not in ("scope", "client_name", "title", "effective_date"))
    )

    messages = [
        {"role": "system", "content": generation_system},
        {"role": "user", "content": user_instruction},
    ]

    # ── Step 3: Call Groq ─────────────────────────────────────────────────────
    try:
        raw_response = groq_client.chat_completion(messages, temperature=0.3, max_tokens=3000)
        # Parse the JSON
        content_data = json.loads(raw_response)
    except json.JSONDecodeError:
        # Attempt to extract JSON from partial response
        logger.warning("Generator: JSON parse failed, attempting extraction from raw response")
        import re
        match = re.search(r"\{.*\}", raw_response, re.DOTALL)
        if match:
            try:
                content_data = json.loads(match.group(0))
            except json.JSONDecodeError:
                content_data = _fallback_content(project_title, doc_type, inputs)
        else:
            content_data = _fallback_content(project_title, doc_type, inputs)
    except RuntimeError as exc:
        logger.error("Groq call failed for document generation: %s", exc)
        content_data = _fallback_content(project_title, doc_type, inputs)

    # ── Step 4: Persist GeneratedDocument ────────────────────────────────────
    gen_doc = GeneratedDocument(
        id=str(uuid.uuid4()),
        title=content_data.get("title", project_title),
        doc_type=doc_type,
        template_variant=template_variant,
        content_json=json.dumps(content_data),
        state="DRAFT",
        owner_id=user.id,
        source_citations=citations_json,
    )
    db.add(gen_doc)
    db.commit()
    db.refresh(gen_doc)

    # ── Step 5: Audit ─────────────────────────────────────────────────────────
    log_event(
        db=db,
        user_id=user.id,
        user_email=user.email,
        action="DOCUMENT_GENERATE",
        resource_type="GeneratedDocument",
        resource_id=gen_doc.id,
        detail={"doc_type": doc_type, "title": gen_doc.title},
    )

    return gen_doc


def _fallback_content(title: str, doc_type: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Minimal fallback content when LLM generation fails."""
    return {
        "title": title,
        "reference_number": f"QCI-{doc_type.upper()}-{datetime.now(timezone.utc).strftime('%Y%m%d')}",
        "sections": [
            {"heading": "Introduction", "content": f"This {doc_type} covers the scope: {inputs.get('scope', 'TBD')}."},
            {"heading": "Terms and Conditions", "content": "Standard QCI terms and conditions apply."},
            {"heading": "Signatures", "content": "Authorised representatives shall sign below."},
        ],
    }


def export_to_docx(gen_doc: GeneratedDocument) -> io.BytesIO:
    """
    Convert a GeneratedDocument to a DOCX file in memory.

    Returns a BytesIO buffer positioned at offset 0.
    """
    from docx import Document as DocxDocument
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    content = json.loads(gen_doc.content_json or "{}")
    docx = DocxDocument()

    # ── QCI branded header ────────────────────────────────────────────────────
    header = docx.sections[0].header
    header_para = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    header_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    header_run = header_para.add_run("QCI – Queensland Construction Inspections")
    header_run.bold = True
    header_run.font.size = Pt(11)
    try:
        header_run.font.color.rgb = RGBColor(0, 70, 127)  # QCI navy
    except Exception:
        pass

    # ── Footer ────────────────────────────────────────────────────────────────
    footer = docx.sections[0].footer
    footer_para = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer_run = footer_para.add_run("Generated by QCI AI Knowledge Hub")
    footer_run.italic = True
    footer_run.font.size = Pt(9)

    # ── Document title ────────────────────────────────────────────────────────
    title_para = docx.add_heading(content.get("title", gen_doc.title), level=0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Reference number & date
    ref_no = content.get("reference_number", gen_doc.id[:8].upper())
    date_str = gen_doc.created_at.strftime("%d %B %Y") if gen_doc.created_at else datetime.now(timezone.utc).strftime("%d %B %Y")
    meta_para = docx.add_paragraph()
    meta_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta_para.add_run(f"Reference: {ref_no}  |  Date: {date_str}").font.size = Pt(10)

    docx.add_paragraph()  # spacer

    # ── Sections ──────────────────────────────────────────────────────────────
    for section in content.get("sections", []):
        heading = section.get("heading", "")
        body_text = section.get("content", "")

        if heading:
            docx.add_heading(heading, level=1)
        if body_text:
            docx.add_paragraph(body_text)

    # ── Save to BytesIO ───────────────────────────────────────────────────────
    buffer = io.BytesIO()
    docx.save(buffer)
    buffer.seek(0)
    return buffer
