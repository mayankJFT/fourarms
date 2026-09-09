"""Seven-stage RAG pipeline."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.ai.citations import CitationEngine
from app.ai.groq_client import groq_client
from app.ai.guardrails import (
    build_access_denied_response,
    build_no_info_response,
    check_relevance,
    scrub_prompt_injection,
)
from app.ai.models import (
    ChatResponse,
    Citation,
    ConversationMessage,
    ConversationSession,
)
from app.audit.logger import log_event
from app.auth.models import User
from app.auth.rbac import build_pinecone_filter
from app.config import settings
from app.documents.models import Chunk, Document
from app.documents.pinecone_client import pinecone_client

logger = logging.getLogger(__name__)

_citation_engine = CitationEngine()

# ── Embedding singleton ───────────────────────────────────────────────────────

_embedding_model = None


def _get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


# ── Keyword overlap score ─────────────────────────────────────────────────────

def _keyword_overlap(query: str, text: str) -> float:
    """Simple token overlap ratio between query and text (0.0–1.0)."""
    q_tokens = set(query.lower().split())
    t_tokens = set(text.lower().split())
    if not q_tokens:
        return 0.0
    return len(q_tokens & t_tokens) / len(q_tokens)


# ── Conversation history helpers ──────────────────────────────────────────────

def _load_history(db: Session, session_id: str, last_n: int = 5) -> List[Dict[str, str]]:
    messages = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.session_id == session_id)
        .order_by(ConversationMessage.created_at.desc())
        .limit(last_n)
        .all()
    )
    return [{"role": m.role, "content": m.content} for m in reversed(messages)]


def _get_or_create_session(
    db: Session, user: User, conversation_id: Optional[str], title: str
) -> ConversationSession:
    if conversation_id:
        session = (
            db.query(ConversationSession)
            .filter(
                ConversationSession.id == conversation_id,
                ConversationSession.user_id == user.id,
            )
            .first()
        )
        if session:
            return session

    # Create new
    session = ConversationSession(
        user_id=user.id,
        title=title[:200],
    )
    db.add(session)
    db.flush()
    return session


def _persist_messages(
    db: Session,
    session: ConversationSession,
    user_query: str,
    cited_response,
) -> None:
    user_msg = ConversationMessage(
        session_id=session.id,
        role="user",
        content=user_query,
    )
    db.add(user_msg)

    citations_json = json.dumps(
        [
            {
                "chunk_id": c.chunk_id,
                "document_id": c.document_id,
                "document_title": c.document_title,
                "page_number": c.page_number,
                "section_title": c.section_title,
                "passage": c.passage,
            }
            for c in cited_response.citations
        ]
    )
    assistant_msg = ConversationMessage(
        session_id=session.id,
        role="assistant",
        content=cited_response.answer_text,
        citations=citations_json,
        guardrail_outcome=cited_response.outcome,
    )
    db.add(assistant_msg)
    db.commit()


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def run_rag_pipeline(
    query: str,
    user: User,
    db: Session,
    conversation_id: Optional[str] = None,
    scope_doc_ids: Optional[List[str]] = None,
) -> ChatResponse:
    """
    Execute the full 7-stage RAG pipeline and return a ChatResponse.
    """
    # Sanitise input
    query = scrub_prompt_injection(query)
    if not query.strip():
        no_info = build_no_info_response()
        return ChatResponse(
            session_id=conversation_id or str(uuid.uuid4()),
            answer=no_info["answer_text"],
            citations=[],
            outcome="NO_INFO",
        )

    # ── Casual / greeting bypass (no RAG needed) ──────────────────────────────
    _CASUAL = {"hi", "hello", "hey", "thanks", "thank you", "bye", "goodbye",
               "what can you do", "help", "who are you", "what are you"}
    if query.strip().lower().rstrip("!?.") in _CASUAL:
        session = _get_or_create_session(db, user, conversation_id, query[:80])
        greetings = {
            "hi": "Hello! 👋 I'm Aria, your QCI Knowledge Hub assistant. Ask me anything about the documents uploaded here — tenders, agreements, proposals, and more.",
            "hello": "Hello! 👋 I'm Aria, your QCI Knowledge Hub assistant. Ask me anything about the documents uploaded here — tenders, agreements, proposals, and more.",
            "hey": "Hey there! I'm Aria. How can I help you with the QCI Knowledge Hub today?",
            "thanks": "You're welcome! Let me know if you have any more questions.",
            "thank you": "Happy to help! Feel free to ask anything else.",
            "bye": "Goodbye! Come back anytime you need help with the documents.",
            "goodbye": "Goodbye! Have a great day.",
            "what can you do": "I can help you:\n\n- **Search** across all uploaded QCI documents\n- **Summarise** tender documents, MOUs, agreements\n- **Answer questions** with cited sources\n- **Scope queries** to specific documents\n\nJust ask away!",
            "help": "I can help you:\n\n- **Search** across all uploaded QCI documents\n- **Summarise** tender documents, MOUs, agreements\n- **Answer questions** with cited sources\n- **Scope queries** to specific documents\n\nJust ask away!",
            "who are you": "I'm **Aria**, the QCI AI Knowledge Hub assistant. I help you find information across QCI's document repository using AI-powered search.",
            "what are you": "I'm **Aria**, the QCI AI Knowledge Hub assistant. I help you find information across QCI's document repository using AI-powered search.",
        }
        answer = greetings.get(query.strip().lower().rstrip("!?."), "Hello! How can I help you today?")
        from app.ai.citations import CitedResponse as CR
        cited = CR(answer_text=answer, citations=[], outcome="ANSWERED")
        _persist_messages(db, session, query, cited)
        return ChatResponse(session_id=session.id, answer=answer, citations=[], outcome="ANSWERED")

    # ── Stage 1: Conversation history + query rephrasing ─────────────────────
    history: List[Dict[str, str]] = []
    if conversation_id:
        history = _load_history(db, conversation_id)

    rephrase_messages = [
        {
            "role": "system",
            "content": (
                "You are a query-understanding assistant. Given the conversation history "
                "and the user's latest question, output ONLY a JSON object with three keys:\n"
                "  rephrased_question: a clear, standalone version of the question\n"
                "  date_filter: ISO date string or null\n"
                "  doctype_filter: document type string or null\n"
                "Do not include any explanation. Output valid JSON only."
            ),
        },
        *history[-4:],  # last 4 turns for context
        {"role": "user", "content": f"Question: {query}"},
    ]

    rephrased_question = query
    date_filter = None
    doctype_filter = None

    try:
        rephrase_raw = groq_client.chat_completion(
            rephrase_messages, temperature=0.0, max_tokens=256
        )
        rephrase_data = json.loads(rephrase_raw)
        rephrased_question = rephrase_data.get("rephrased_question", query)
        date_filter = rephrase_data.get("date_filter")
        doctype_filter = rephrase_data.get("doctype_filter")
    except Exception as exc:
        logger.warning("Query rephrasing failed, using original: %s", exc)

    # ── Stage 2: Build Pinecone filter ───────────────────────────────────────
    base_filter = build_pinecone_filter(user)

    extra_conditions: List[Dict[str, Any]] = []
    if scope_doc_ids:
        extra_conditions.append({"document_id": {"$in": scope_doc_ids}})
    if doctype_filter:
        extra_conditions.append({"doc_type": {"$eq": doctype_filter}})

    if extra_conditions:
        if base_filter:
            final_filter: Dict[str, Any] = {"$and": [base_filter, *extra_conditions]}
        else:
            final_filter = {"$and": extra_conditions} if len(extra_conditions) > 1 else extra_conditions[0]
    else:
        final_filter = base_filter

    # ── Stage 3: Embed + retrieve ─────────────────────────────────────────────
    model = _get_embedding_model()
    embedding = model.encode([rephrased_question])[0].tolist()

    pinecone_results = pinecone_client.query_chunks(
        embedding=embedding,
        filter_dict=final_filter,
        top_k=20,
    )

    # Keyword fallback: SQLite LIKE search when Pinecone returns < 5 results
    if len(pinecone_results) < 5:
        logger.info("Pinecone returned %d results, falling back to keyword search", len(pinecone_results))
        keyword_terms = [w for w in rephrased_question.split() if len(w) > 3]
        if keyword_terms:
            keyword_chunks = (
                db.query(Chunk)
                .filter(Chunk.text.ilike(f"%{keyword_terms[0]}%"))
                .limit(20)
                .all()
            )
            pinecone_ids = {r["id"] for r in pinecone_results}
            for kc in keyword_chunks:
                if kc.id not in pinecone_ids:
                    pinecone_results.append({
                        "id": kc.id,
                        "score": 0.1,  # Low base score for keyword match
                        "metadata": {
                            "document_id": kc.document_id,
                            "text_preview": kc.text[:200],
                            "page_number": kc.page_number or 0,
                            "section_title": kc.section_title or "",
                            "document_title": "",
                            "is_hr_data": False,
                            "confidentiality": "INTERNAL",
                        },
                    })

    # ── Stage 4: Re-rank and threshold ───────────────────────────────────────
    for chunk in pinecone_results:
        cosine_score = float(chunk.get("score", 0.0))
        text_preview = chunk.get("metadata", {}).get("text_preview", "")
        kw_score = _keyword_overlap(rephrased_question, text_preview)
        chunk["combined_score"] = cosine_score * 0.6 + kw_score * 0.4

    pinecone_results.sort(key=lambda c: c["combined_score"], reverse=True)
    top_chunks = pinecone_results[: settings.RAG_TOP_K]

    if not any(c.get("combined_score", c.get("score", 0.0)) >= settings.RELEVANCE_THRESHOLD for c in top_chunks):
        no_info = build_no_info_response()
        session = _get_or_create_session(db, user, conversation_id, query[:80])
        from app.ai.citations import CitedResponse as CR
        cited = CR(answer_text=no_info["answer_text"], citations=[], outcome="NO_INFO")
        _persist_messages(db, session, query, cited)
        log_event(db, user.id, user.email, "RAG_QUERY", detail={"outcome": "NO_INFO", "query": query[:200]})
        return ChatResponse(
            session_id=session.id,
            answer=no_info["answer_text"],
            citations=[],
            outcome="NO_INFO",
        )

    # ── Stage 5: Build context and call Groq ─────────────────────────────────
    context_parts: List[str] = []
    for i, chunk in enumerate(top_chunks, start=1):
        meta = chunk.get("metadata", {})
        text = meta.get("text_preview", "")
        title = meta.get("document_title", "")
        page = meta.get("page_number", "")
        context_parts.append(f"[SOURCE {i}] (Document: {title}, Page: {page})\n{text}")

    context_str = "\n\n".join(context_parts)

    system_prompt = (
        "You are Aria, the QCI AI Knowledge Hub assistant — knowledgeable, professional, and friendly.\n\n"
        "BEHAVIOUR RULES:\n"
        "1. Greet warmly on first interaction (e.g. 'Hello! Happy to help.'). For follow-up questions in the same conversation, skip the greeting.\n"
        "2. Answer using ONLY the source excerpts provided below. Cite every factual claim with [SOURCE N].\n"
        "3. Format responses using Markdown: use **bold** for key terms, tables for comparisons, bullet or numbered lists for multi-part answers, and headings (##) for long structured responses.\n"
        "4. Keep answers concise but complete. Avoid unnecessary filler.\n"
        "5. For casual queries (greetings, thanks, 'what can you do?'), respond naturally without citing sources.\n"
        "6. If the sources do not contain enough information to answer, respond with exactly: INSUFFICIENT_CONTEXT\n\n"
        f"Sources:\n{context_str}"
    )

    llm_messages = [
        {"role": "system", "content": system_prompt},
        *history[-4:],
        {"role": "user", "content": rephrased_question},
    ]

    try:
        llm_response = groq_client.chat_completion(
            llm_messages, temperature=0.1, max_tokens=1500
        )
    except RuntimeError as exc:
        logger.error("LLM call failed: %s", exc)
        no_info = build_no_info_response()
        return ChatResponse(
            session_id=conversation_id or str(uuid.uuid4()),
            answer=no_info["answer_text"],
            citations=[],
            outcome="NO_INFO",
        )

    # ── Stage 6: Citation parsing ─────────────────────────────────────────────
    cited_response = _citation_engine.parse_citations(llm_response, top_chunks)

    # ── Stage 7: Persist and return ───────────────────────────────────────────
    session = _get_or_create_session(db, user, conversation_id, query[:80])
    _persist_messages(db, session, query, cited_response)

    log_event(
        db=db,
        user_id=user.id,
        user_email=user.email,
        action="RAG_QUERY",
        detail={
            "outcome": cited_response.outcome,
            "query": query[:200],
            "citations_count": len(cited_response.citations),
            "session_id": session.id,
        },
    )

    return ChatResponse(
        session_id=session.id,
        answer=cited_response.answer_text,
        citations=[
            Citation(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                document_title=c.document_title,
                page_number=c.page_number,
                section_title=c.section_title,
                passage=c.passage,
            )
            for c in cited_response.citations
        ],
        outcome=cited_response.outcome,
    )
