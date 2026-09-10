"""AI document-category classification.

Runs during ingestion (after text extraction) so an uploaded document gets a
suggested category without the user having to pick one manually. The user
can still review and change the suggestion afterwards via
PUT /documents/{doc_id}/category.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional, TypedDict

from app.ai.llm_client import llm_client

logger = logging.getLogger(__name__)

# The fixed set of buckets the UI offers. Anything the model can't confidently
# map to one of these becomes "Other", with the raw detected type preserved
# separately so nothing is lost.
DOCUMENT_CATEGORIES = [
    "Internal",
    "External",
    "Confidential",
    "Legal",
    "Financial",
    "HR",
    "Technical",
    "Other",
]

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


class ClassificationResult(TypedDict):
    category: str
    detected_type: str


def _fallback_result() -> ClassificationResult:
    return {"category": "Other", "detected_type": "Unclassified document"}


def classify_document(text_sample: str, filename: str) -> ClassificationResult:
    """
    Ask the LLM to identify what kind of document this is and map it onto
    one of DOCUMENT_CATEGORIES.

    *text_sample* should be a representative excerpt (a page or two is
    plenty — this is a cheap classification call, not a full-document read).
    Never raises: on any failure it returns the "Other" fallback so ingestion
    never blocks on classification.
    """
    sample = (text_sample or "").strip()[:4000]
    if not sample:
        return _fallback_result()

    system_prompt = (
        "You classify uploaded documents for a document management system.\n\n"
        f"Allowed categories (choose exactly one): {', '.join(DOCUMENT_CATEGORIES)}.\n\n"
        "Rules:\n"
        "1. detected_type: a short, specific, human-readable description of what the "
        "document actually is (e.g. \"Non-Disclosure Agreement\", \"Vendor Invoice\", "
        "\"Employee Handbook\", \"Tender Notice\", \"API Design Document\").\n"
        "2. category: map detected_type onto exactly one of the allowed categories above. "
        "Use your judgement — e.g. a contract or NDA is 'Legal', a payslip or invoice is "
        "'Financial', a resume or leave policy is 'HR', an architecture doc or spec is "
        "'Technical', a memo meant only for staff is 'Internal', a document from an outside "
        "party is 'External', anything explicitly sensitive/restricted is 'Confidential'.\n"
        "3. If nothing fits reasonably, use category 'Other' and put your best guess of the "
        "document's nature in detected_type.\n\n"
        'Output ONLY a JSON object: {"category": "...", "detected_type": "..."}. No prose.'
    )

    user_prompt = f"Filename: {filename}\n\nDocument excerpt:\n{sample}"

    try:
        raw = llm_client.chat_completion(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=150,
        )
        data = _parse_json(raw)
        category = str(data.get("category", "")).strip()
        detected_type = str(data.get("detected_type", "")).strip() or "Unclassified document"

        if category not in DOCUMENT_CATEGORIES:
            # Model went off-script (invented a category, wrong casing, etc.) — treat
            # its own label as the detected type and fall back to "Other" as the bucket.
            if category:
                detected_type = category if detected_type == "Unclassified document" else detected_type
            category = "Other"

        return {"category": category, "detected_type": detected_type}
    except Exception as exc:
        logger.warning("Document classification failed for %s: %s", filename, exc)
        return _fallback_result()


def _parse_json(raw: str) -> dict:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        match = _JSON_OBJECT_RE.search(raw or "")
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        return {}
