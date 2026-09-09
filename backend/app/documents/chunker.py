"""Text chunking with configurable token size and overlap."""

from __future__ import annotations

import re
from typing import Generator, Optional

from app.config import settings


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences on '. ', '? ', '! ', or newlines."""
    # Split on sentence boundaries
    parts = re.split(r"(?<=[.?!])\s+|\n{2,}", text.strip())
    # Filter out empty strings
    return [p.strip() for p in parts if p.strip()]


def chunk_text(
    text: str,
    chunk_size: int = settings.CHUNK_SIZE_TOKENS,
    overlap: int = settings.CHUNK_OVERLAP_TOKENS,
    page_number: Optional[int] = None,
    section_title: Optional[str] = None,
) -> Generator[dict, None, None]:
    """
    Split *text* into overlapping chunks, each with approximately *chunk_size*
    tokens (words).  Overlap is achieved by re-including the last *overlap* words
    of the previous chunk at the start of the next one.

    Yields dicts with keys:
        text, chunk_index, page_number, section_title, token_count
    """
    sentences = _split_sentences(text)
    if not sentences:
        return

    current_words: list[str] = []
    chunk_index = 0

    for sentence in sentences:
        sentence_words = sentence.split()
        # If adding this sentence would exceed the limit, emit what we have
        if current_words and (len(current_words) + len(sentence_words)) > chunk_size:
            chunk_text_str = " ".join(current_words)
            yield {
                "text": chunk_text_str,
                "chunk_index": chunk_index,
                "page_number": page_number,
                "section_title": section_title,
                "token_count": len(current_words),
            }
            chunk_index += 1
            # Carry over the last *overlap* words for context continuity
            current_words = current_words[-overlap:] if overlap > 0 else []

        current_words.extend(sentence_words)

        # Force-emit if a single sentence is already larger than chunk_size
        while len(current_words) >= chunk_size:
            chunk_text_str = " ".join(current_words[:chunk_size])
            yield {
                "text": chunk_text_str,
                "chunk_index": chunk_index,
                "page_number": page_number,
                "section_title": section_title,
                "token_count": chunk_size,
            }
            chunk_index += 1
            current_words = current_words[chunk_size - overlap:] if overlap > 0 else current_words[chunk_size:]

    # Emit any remaining words
    if current_words:
        chunk_text_str = " ".join(current_words)
        yield {
            "text": chunk_text_str,
            "chunk_index": chunk_index,
            "page_number": page_number,
            "section_title": section_title,
            "token_count": len(current_words),
        }
