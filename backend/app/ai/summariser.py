"""Document summarisation helpers built on top of the RAG pipeline."""

from __future__ import annotations

from typing import List

from sqlalchemy.orm import Session

from app.ai.models import ChatResponse
from app.ai.rag import run_rag_pipeline
from app.auth.models import User


_LENGTH_HINTS = {
    "short": "Provide a concise summary in 3-5 sentences.",
    "medium": "Provide a clear summary in 2-3 paragraphs covering the key points.",
    "long": "Provide a comprehensive, detailed summary covering all major sections and findings.",
}


async def summarise_document(
    doc_id: str,
    length: str,
    user: User,
    db: Session,
) -> ChatResponse:
    """
    Summarise a single document by running RAG scoped to *doc_id*.
    """
    length_hint = _LENGTH_HINTS.get(length, _LENGTH_HINTS["medium"])
    query = f"Summarise this document. {length_hint}"

    return await run_rag_pipeline(
        query=query,
        user=user,
        db=db,
        conversation_id=None,
        scope_doc_ids=[doc_id],
    )


async def summarise_multiple(
    doc_ids: List[str],
    query: str,
    user: User,
    db: Session,
) -> ChatResponse:
    """
    Answer *query* scoped to a specific set of documents.
    Useful for comparing or synthesising across multiple documents.
    """
    if not query:
        query = "Summarise these documents and highlight commonalities and differences."

    return await run_rag_pipeline(
        query=query,
        user=user,
        db=db,
        conversation_id=None,
        scope_doc_ids=doc_ids,
    )
