"""Text chunking — section-aware, with header stripping and overlap."""

from __future__ import annotations

import re
from typing import Generator, Optional

from app.config import settings

# Patterns that indicate a section heading inside PDF text
_HEADING_RE = re.compile(
    r"^("
    r"[IVX]+\.\s+[A-Z]"           # Roman numeral: "II. SCOPE"
    r"|[0-9]+\.\s+[A-Z]"           # Numbered: "1. Introduction"
    r"|[A-Z][A-Z\s]{4,}$"          # ALL CAPS line ≥ 5 chars
    r")"
)

# A real heading is a short label ("1. Introduction", "II. Scope of Work"),
# not a full sentence — but numbered/lettered contract clauses ("2. This
# pricing does not include cost of any hardware...") also start with
# "<number>. <Capital>" and would otherwise match _HEADING_RE just as well.
# Cap the word count so long numbered clauses fall through to body text
# instead of being misdetected as section headings.
_HEADING_MAX_WORDS = 10

# Repeated title header that pdfplumber extracts on every page
_TITLE_STRIP_RE = re.compile(
    r"TENDER DOCUMENT FOR ENGAGEMENT.*?QCI/\d+/\d+\s*",
    re.IGNORECASE | re.DOTALL,
)


def _clean_page_text(text: str) -> str:
    """Remove repeated title banner and page artefacts."""
    text = _TITLE_STRIP_RE.sub("", text)
    # Collapse 3+ blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_into_sections(text: str) -> list[tuple[Optional[str], str]]:
    """
    Split *text* on heading lines, returning list of (heading, body) pairs.
    If no headings found, returns [(None, text)].
    """
    lines = text.splitlines()
    sections: list[tuple[Optional[str], str]] = []
    current_heading: Optional[str] = None
    current_body: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped and _HEADING_RE.match(stripped) and len(stripped.split()) <= _HEADING_MAX_WORDS:
            # Flush previous section
            body = "\n".join(current_body).strip()
            if body:
                sections.append((current_heading, body))
            current_heading = stripped
            current_body = []
        else:
            current_body.append(line)

    # Flush last section
    body = "\n".join(current_body).strip()
    if body:
        sections.append((current_heading, body))

    return sections if sections else [(None, text)]


def chunk_text(
    text: str,
    chunk_size: int = settings.CHUNK_SIZE_TOKENS,
    overlap: int = settings.CHUNK_OVERLAP_TOKENS,
    page_number: Optional[int] = None,
    section_title: Optional[str] = None,
) -> Generator[dict, None, None]:
    """
    Section-aware chunker.

    1. Cleans repeated headers.
    2. Splits on detected headings.
    3. Yields overlapping word-level chunks, each tagged with its section.
    """
    text = _clean_page_text(text)
    if not text:
        return

    # If caller already supplied a section_title (e.g. DOCX headings), skip detection
    if section_title is not None:
        sections = [(section_title, text)]
    else:
        sections = _split_into_sections(text)

    chunk_index = 0
    for heading, body in sections:
        effective_title = heading or section_title
        # Prefix each chunk with its section heading for better embedding
        prefix = f"{effective_title}: " if effective_title else ""
        words = body.split()
        if not words:
            continue

        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk_words = words[start:end]
            chunk_str = prefix + " ".join(chunk_words)
            yield {
                "text": chunk_str,
                "chunk_index": chunk_index,
                "page_number": page_number,
                "section_title": effective_title,
                "token_count": len(chunk_words),
            }
            chunk_index += 1
            if end >= len(words):
                break
            start = end - overlap
