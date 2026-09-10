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


def build_no_info_response(query: str = "") -> Dict[str, Any]:
    """Friendly response when the knowledge base has no relevant information — invites a follow-up instead of a dead end."""
    subject = f' about "{query.strip()}"' if query.strip() else ""
    return {
        "answer_text": (
            f"I couldn't find anything{subject} in the documents I currently have access to — "
            "but let's narrow it down together. A few things that might help:\n\n"
            "- Do you have a specific **document name, tender number, or date** in mind?\n"
            "- Could you rephrase the question, or add a bit more detail about what you're looking for?\n"
            "- If the document exists but hasn't been added yet, you (or an admin) can upload it from the "
            "**Repository** page and I'll be able to search it right away.\n\n"
            "What would you like to try next?"
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
