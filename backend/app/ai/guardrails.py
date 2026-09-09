"""Guardrail functions: relevance gating, prompt injection scrubbing, sentinel responses."""

from __future__ import annotations

import re
from typing import Any, Dict, List

from app.config import settings

# Patterns that look like prompt injection / jailbreak attempts
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?",
    r"you\s+are\s+now",
    r"system\s*:",
    r"<\s*system\s*>",
    r"disregard\s+(all\s+)?previous",
    r"forget\s+everything",
    r"new\s+persona",
    r"act\s+as\s+(if\s+you\s+are|a\s+different)",
    r"pretend\s+(to\s+be|you\s+are)",
    r"do\s+not\s+follow\s+your\s+(instructions?|guidelines?|rules?)",
    r"override\s+(your\s+)?(instructions?|system|prompt)",
    r"bypass\s+(all\s+)?(filters?|restrictions?|safety)",
    r"jailbreak",
    r"dan\s+mode",
    r"developer\s+mode\s+enabled",
]

_INJECTION_RE = re.compile(
    "|".join(_INJECTION_PATTERNS),
    flags=re.IGNORECASE,
)


def check_relevance(chunks: List[Any], threshold: float = settings.RELEVANCE_THRESHOLD) -> bool:
    """
    Return True if at least one chunk has a retrieval score above *threshold*.

    *chunks* is expected to be a list of dicts with a "score" key (from Pinecone).
    """
    if not chunks:
        return False
    return any(
        (c.get("score", 0.0) if isinstance(c, dict) else getattr(c, "score", 0.0)) >= threshold
        for c in chunks
    )


def scrub_prompt_injection(text: str) -> str:
    """
    Remove lines that match known prompt-injection patterns.

    Returns the cleaned text.
    """
    lines = text.splitlines()
    cleaned = [line for line in lines if not _INJECTION_RE.search(line)]
    return "\n".join(cleaned)


def build_no_info_response() -> Dict[str, Any]:
    """Standard response when the knowledge base has no relevant information."""
    return {
        "answer_text": (
            "I could not find relevant information in the QCI Knowledge Hub to answer "
            "your question. Please try rephrasing your query or check that the relevant "
            "documents have been uploaded and indexed."
        ),
        "citations": [],
        "outcome": "NO_INFO",
    }


def build_access_denied_response() -> Dict[str, Any]:
    """Standard response when the user's role does not permit access to the relevant data."""
    return {
        "answer_text": (
            "Access denied. The information required to answer your question is restricted "
            "to users with a higher clearance level."
        ),
        "citations": [],
        "outcome": "ACCESS_DENIED",
    }
