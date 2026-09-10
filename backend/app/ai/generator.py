"""Document generation via RAG-augmented LLM calls, with DOCX export."""

from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.ai.llm_client import llm_client
from app.config import settings
from app.ai.rag import run_rag_pipeline
from app.audit.logger import log_event
from app.auth.models import User
from app.workflow.models import GeneratedDocument

logger = logging.getLogger(__name__)


def _sanitize_heading_identity(heading: str, org_short_name: str) -> str:
    """A template's extracted headings can bake in ITS OWN vendor's name (e.g.
    "About Jellyfish Technologies", "Overview of Acme Corp") — reusing that
    verbatim as a required heading would label our freshly-written content
    with someone else's company name. "About/Overview (of) <Company>" is
    almost always a section that introduces whoever is issuing the document,
    so swap the name for ours rather than reproducing the reference vendor's
    identity in the new document's heading."""
    import re

    match = re.match(r"^(About|Overview(?:\s+of)?)\s+.+$", heading.strip(), re.IGNORECASE)
    if match:
        return f"{match.group(1)} {org_short_name}"
    return heading


async def generate_document(
    doc_type: str,
    template_variant: int,
    inputs: Dict[str, Any],
    user: User,
    db: Session,
    template_id: Optional[str] = None,
) -> GeneratedDocument:
    """
    Generate a new document using RAG-sourced precedent clauses, optionally
    mimicking the structure/format of a user-uploaded DocumentTemplate.

    Steps:
    1. Retrieve relevant precedent via RAG scoped to existing docs of *doc_type*
    2. Resolve a reference template to mimic the format of, if one was requested
       or one exists for this doc_type (auto-picks the most recent otherwise)
    3. Build a generation prompt with retrieved context + user inputs + template
    4. Call the LLM to produce structured JSON sections
    5. Persist GeneratedDocument in SQLite
    6. Audit log the event
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

    # ── Step 2: Resolve the template to mimic, if any ─────────────────────────
    from app.ai.models import DocumentTemplate

    template: DocumentTemplate | None = None
    if template_id:
        template = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    else:
        # No explicit choice — default to the most recently uploaded template for
        # this category, if the user has ever uploaded one, so "upload once, every
        # future generation in that category uses it" works without extra clicks.
        template = (
            db.query(DocumentTemplate)
            .filter(DocumentTemplate.doc_type == doc_type.upper())
            .order_by(DocumentTemplate.created_at.desc())
            .first()
        )

    required_headings: list[str] = []
    if template and template.outline_json and template.outline_json != "[]":
        try:
            required_headings = [
                _sanitize_heading_identity(h, settings.ORG_FULL_NAME)
                for h in json.loads(template.outline_json)
            ]
        except json.JSONDecodeError:
            required_headings = []

    template_block = ""
    if template:
        template_block = (
            f"\n\nFORMAT TO MIMIC:\nThe user has uploaded a reference {doc_type.replace('_', ' ')} "
            f"template titled \"{template.title}\". Reproduce ITS STRUCTURE as closely as possible — "
            f"the same section headings (in the same order), the same level of formality and tone, "
            f"the same use of numbered clauses or tables where the template uses them, and roughly "
            f"the same overall length/depth per section. Do NOT copy its actual names, figures, dates, "
            f"organisation identities, or other real content — write entirely fresh content for the "
            f"details given below, only shaped like this example. In particular: the reference template "
            f"was authored by a DIFFERENT organisation for a DIFFERENT client — if it has a section "
            f"introducing its own author/vendor (e.g. \"About <Company>\"), your equivalent section must "
            f"introduce {settings.ORG_SHORT_NAME} ({settings.ORG_FULL_NAME}), never the reference's "
            f"organisation name, and every section must be about the client named below, not the "
            f"reference template's original client:\n\n"
            f"--- REFERENCE TEMPLATE ---\n{template.content_text}\n--- END REFERENCE TEMPLATE ---\n"
        )

    # ── Step 3: Build generation prompt ──────────────────────────────────────
    # NOTE: the DocGen form's field key is "counterparty_name", not "client_name" —
    # fall back to it so the real name reaches the LLM instead of the "Client"
    # placeholder. Likewise, "title" was never provided as a form field at all,
    # so it must default to nothing here — the LLM is asked for its own "title"
    # in the JSON schema below, and a fake default like "QCI Proposal" fed in as
    # if it were user intent gets echoed straight back as the real title.
    scope_str = inputs.get("scope", "")
    client_name = inputs.get("client_name") or inputs.get("counterparty_name") or ""
    user_title = inputs.get("title") or ""
    fallback_title = f"QCI {doc_type.capitalize()}"  # only used if the LLM's JSON omits "title" entirely
    effective_date = inputs.get("effective_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    generation_system = (
        f"You are a professional contract and proposal writer for {settings.ORG_SHORT_NAME} ({settings.ORG_FULL_NAME}). "
        f"Generate a complete {doc_type.replace('_', ' ').title()} document. "
        f"Use the precedent clauses below for guidance, then produce a fully structured document."
        f"{' Match the FORMAT TO MIMIC section below exactly in structure and style.' if template else ''}\n\n"
        f"PRECEDENT CLAUSES:\n{precedent_text}\n"
        f"{template_block}\n\n"
        f"Output ONLY valid JSON with this schema:\n"
        "{\n"
        '  "title": "string",\n'
        '  "reference_number": "string",\n'
        '  "sections": [\n'
        '    {"heading": "string", "content": "string"}\n'
        "  ]\n"
        "}\n"
        + (
            f"The \"sections\" array is MANDATORY to contain EXACTLY these {len(required_headings)} headings, "
            f"in this exact order, one per line item below — do not merge, skip, reorder, rename, or add any:\n"
            + "\n".join(f"  {i}. {h}" for i, h in enumerate(required_headings, 1)) + "\n"
            if required_headings
            else (
                "The \"sections\" array MUST follow the reference template's heading order, as seen in the "
                "reference template above.\n" if template else ""
            )
        )
        + "Do not include any text outside the JSON object."
    )

    user_instruction = (
        f"Generate a {doc_type.replace('_', ' ').title()} with the following details:\n"
        f"- Project/Scope: {scope_str}\n"
        f"- Client: {client_name if client_name else '(not specified — write generically, do not invent a name)'}\n"
        f"- Title: {user_title if user_title else '(not specified — craft a concise, professional title reflecting the scope above)'}\n"
        f"- Effective Date: {effective_date}\n"
        + "\n".join(f"- {k}: {v}" for k, v in inputs.items()
                    if k not in ("scope", "client_name", "counterparty_name", "title", "effective_date"))
    )

    messages = [
        {"role": "system", "content": generation_system},
        {"role": "user", "content": user_instruction},
    ]

    # ── Step 4: Call the LLM ──────────────────────────────────────────────────
    # Lower temperature when mimicking a template — the model needs to follow the
    # required heading list precisely, not get creative with the structure.
    generation_temperature = 0.15 if required_headings else 0.3
    try:
        raw_response = llm_client.chat_completion(messages, temperature=generation_temperature, max_tokens=3000)
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
                content_data = _fallback_content(user_title or fallback_title, doc_type, inputs)
        else:
            content_data = _fallback_content(user_title or fallback_title, doc_type, inputs)
    except RuntimeError as exc:
        logger.error("Groq call failed for document generation: %s", exc)
        content_data = _fallback_content(user_title or fallback_title, doc_type, inputs)

    # The heading-order instruction above is just a prompt — models don't always
    # obey it (observed: with the exact same template, one run reused every
    # heading verbatim, another invented its own generic structure instead).
    # Enforce it deterministically here rather than hoping: relabel the model's
    # generated sections, in the order it wrote them, with the template's real
    # headings at the same positions. This keeps 100% of the model's generated
    # wording — only the heading labels are corrected — and guarantees "same
    # format and headings" regardless of how well the model followed the prompt.
    if required_headings and isinstance(content_data.get("sections"), list):
        sections = content_data["sections"]
        for i, heading in enumerate(required_headings):
            if i < len(sections):
                sections[i]["heading"] = heading
            else:
                # Model wrote fewer sections than the template has headings —
                # append an empty one rather than silently dropping the heading.
                sections.append({"heading": heading, "content": ""})
        content_data["sections"] = sections

    # ── Step 5: Persist GeneratedDocument ────────────────────────────────────
    gen_doc = GeneratedDocument(
        id=str(uuid.uuid4()),
        title=content_data.get("title", user_title or fallback_title),
        doc_type=doc_type,
        template_variant=template_variant,
        template_id=template.id if template else None,
        content_json=json.dumps(content_data),
        state="DRAFT",
        owner_id=user.id,
        source_citations=citations_json,
    )
    db.add(gen_doc)
    db.commit()
    db.refresh(gen_doc)

    # ── Step 6: Audit ─────────────────────────────────────────────────────────
    log_event(
        db=db,
        user_id=user.id,
        user_email=user.email,
        action="DOCUMENT_GENERATE",
        resource_type="GeneratedDocument",
        resource_id=gen_doc.id,
        detail={"doc_type": doc_type, "title": gen_doc.title, "template_id": template.id if template else None},
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
    header_run = header_para.add_run(f"{settings.ORG_SHORT_NAME} – {settings.ORG_FULL_NAME}")
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
    # Section content sometimes embeds a raw <table>...</table> HTML block (see
    # DocumentPreview.tsx's splitContentSegments for why) — render those as real
    # Word tables instead of dumping the literal tags into a paragraph.
    import re as _re
    from html.parser import HTMLParser

    class _TableRowExtractor(HTMLParser):
        def __init__(self) -> None:
            super().__init__()
            self.rows: list[list[str]] = []
            self._row: list[str] | None = None
            self._cell: list[str] | None = None

        def handle_starttag(self, tag: str, attrs) -> None:
            if tag == "tr":
                self._row = []
            elif tag in ("td", "th"):
                self._cell = []

        def handle_endtag(self, tag: str) -> None:
            if tag == "tr" and self._row is not None:
                self.rows.append(self._row)
                self._row = None
            elif tag in ("td", "th") and self._cell is not None and self._row is not None:
                self._row.append("".join(self._cell).strip())
                self._cell = None

        def handle_data(self, data: str) -> None:
            if self._cell is not None:
                self._cell.append(data)

    table_re = _re.compile(r"<table[\s\S]*?</table>", _re.IGNORECASE)

    for section in content.get("sections", []):
        heading = section.get("heading", "")
        body_text = section.get("content", "")

        if heading:
            docx.add_heading(heading, level=1)

        last_end = 0
        for m in table_re.finditer(body_text):
            prose = body_text[last_end:m.start()].strip()
            if prose:
                docx.add_paragraph(prose)
            extractor = _TableRowExtractor()
            extractor.feed(m.group(0))
            if extractor.rows:
                n_cols = max(len(r) for r in extractor.rows)
                table = docx.add_table(rows=len(extractor.rows), cols=n_cols)
                try:
                    table.style = "Light Grid Accent 1"
                except Exception:
                    pass
                for ri, row in enumerate(extractor.rows):
                    for ci in range(n_cols):
                        table.cell(ri, ci).text = row[ci] if ci < len(row) else ""
                docx.add_paragraph()  # spacer after table
            last_end = m.end()
        trailing_prose = body_text[last_end:].strip()
        if trailing_prose:
            docx.add_paragraph(trailing_prose)

    # ── Save to BytesIO ───────────────────────────────────────────────────────
    buffer = io.BytesIO()
    docx.save(buffer)
    buffer.seek(0)
    return buffer
