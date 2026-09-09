"""Citation engine: parse [SOURCE N] markers from LLM responses."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Citation:
    chunk_id: str
    document_id: str
    document_title: str
    page_number: Optional[int]
    section_title: Optional[str]
    passage: str


@dataclass
class CitedResponse:
    answer_text: str
    citations: List[Citation]
    outcome: str  # OK / NO_INFO / ACCESS_DENIED / INSUFFICIENT_CONTEXT


_SOURCE_MARKER_RE = re.compile(r"\[SOURCE\s*(\d+)\]", re.IGNORECASE)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


class CitationEngine:
    """
    Maps [SOURCE N] markers in LLM output back to the retrieved chunks,
    strips unsupported factual claims, and builds a CitedResponse.
    """

    def parse_citations(
        self,
        response_text: str,
        chunks: List[Dict[str, Any]],
    ) -> CitedResponse:
        """
        Parameters
        ----------
        response_text : str
            Raw text returned by the LLM, may contain [SOURCE N] markers.
        chunks : list[dict]
            Ordered list of retrieved chunks passed to the LLM as context.
            Each dict has keys: id, score, metadata.

        Returns
        -------
        CitedResponse
        """
        # Handle sentinel values
        if "INSUFFICIENT_CONTEXT" in response_text:
            return CitedResponse(
                answer_text=(
                    "The documents in scope do not contain enough information "
                    "to answer this question reliably."
                ),
                citations=[],
                outcome="INSUFFICIENT_CONTEXT",
            )

        # Collect all source indices referenced anywhere in the response
        used_source_indices: set[int] = set()
        for m in _SOURCE_MARKER_RE.findall(response_text):
            used_source_indices.add(int(m))

        # Strip [SOURCE N] markers and use the full LLM answer
        clean_text = _SOURCE_MARKER_RE.sub("", response_text).strip()

        # Build citations
        citations: List[Citation] = []
        seen_chunk_ids: set[str] = set()
        for src_idx in sorted(used_source_indices):
            # SOURCE markers are 1-based
            chunk_index = src_idx - 1
            if chunk_index < 0 or chunk_index >= len(chunks):
                continue
            chunk = chunks[chunk_index]
            chunk_id = chunk.get("id", "")
            if chunk_id in seen_chunk_ids:
                continue
            seen_chunk_ids.add(chunk_id)

            meta = chunk.get("metadata", {})
            citations.append(
                Citation(
                    chunk_id=chunk_id,
                    document_id=meta.get("document_id", ""),
                    document_title=meta.get("document_title", ""),
                    page_number=meta.get("page_number") or None,
                    section_title=meta.get("section_title") or None,
                    passage=meta.get("text_preview", "")[:300],
                )
            )

        outcome = "OK" if clean_text else "NO_INFO"
        return CitedResponse(
            answer_text=clean_text or "No supported answer could be extracted.",
            citations=citations,
            outcome=outcome,
        )
