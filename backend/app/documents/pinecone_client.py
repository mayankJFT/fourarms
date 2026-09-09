"""Pinecone vector store singleton client."""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

_EMBEDDING_DIM = 384
_METRIC = "cosine"
_BATCH_SIZE = 100


class PineconeClient:
    """Singleton wrapper around the Pinecone index."""

    _instance: Optional["PineconeClient"] = None

    def __new__(cls) -> "PineconeClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._index = None
            cls._instance._pc = None
        return cls._instance

    # ── Initialisation ────────────────────────────────────────────────────────

    def init_pinecone(self) -> None:
        """Connect to Pinecone and create the index if it doesn't exist."""
        if not settings.PINECONE_API_KEY:
            logger.warning("PINECONE_API_KEY not set – vector store disabled")
            return

        try:
            from pinecone import Pinecone, ServerlessSpec

            self._pc = Pinecone(api_key=settings.PINECONE_API_KEY)

            existing = [idx.name for idx in self._pc.list_indexes()]
            if settings.PINECONE_INDEX not in existing:
                logger.info("Creating Pinecone index '%s'…", settings.PINECONE_INDEX)
                self._pc.create_index(
                    name=settings.PINECONE_INDEX,
                    dimension=_EMBEDDING_DIM,
                    metric=_METRIC,
                    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
                )
                # Wait for the index to be ready
                for _ in range(30):
                    desc = self._pc.describe_index(settings.PINECONE_INDEX)
                    if getattr(desc.status, "ready", False):
                        break
                    time.sleep(2)

            self._index = self._pc.Index(settings.PINECONE_INDEX)
            logger.info("Pinecone index '%s' ready", settings.PINECONE_INDEX)
        except Exception as exc:
            logger.error("Pinecone init failed: %s", exc)

    @property
    def available(self) -> bool:
        return self._index is not None

    # ── Upsert ────────────────────────────────────────────────────────────────

    def upsert_chunks(self, vectors: List[Dict[str, Any]]) -> None:
        """
        Upsert *vectors* to Pinecone in batches of 100.

        Each item must be: {"id": str, "values": list[float], "metadata": dict}
        """
        if not self.available:
            logger.warning("Pinecone not available – skipping upsert of %d vectors", len(vectors))
            return

        for i in range(0, len(vectors), _BATCH_SIZE):
            batch = vectors[i : i + _BATCH_SIZE]
            try:
                self._index.upsert(vectors=batch)
            except Exception as exc:
                logger.error("Pinecone upsert batch %d failed: %s", i // _BATCH_SIZE, exc)

    # ── Query ─────────────────────────────────────────────────────────────────

    def query_chunks(
        self,
        embedding: List[float],
        filter_dict: Dict[str, Any],
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Query the index, returning a list of match dicts (id, score, metadata).
        """
        if not self.available:
            logger.warning("Pinecone not available – returning empty results")
            return []

        try:
            kwargs: Dict[str, Any] = {
                "vector": embedding,
                "top_k": top_k,
                "include_metadata": True,
            }
            if filter_dict:
                kwargs["filter"] = filter_dict

            response = self._index.query(**kwargs)
            # SDK v10 returns ScoredVector objects (attribute access), not dicts
            matches = response.matches if hasattr(response, "matches") else response.get("matches", [])
            return [
                {
                    "id": m.id if hasattr(m, "id") else m["id"],
                    "score": float(m.score if hasattr(m, "score") else m.get("score", 0.0)),
                    "metadata": dict(m.metadata) if hasattr(m, "metadata") else m.get("metadata", {}),
                }
                for m in matches
            ]
        except Exception as exc:
            logger.error("Pinecone query failed: %s", exc)
            return []

    # ── Delete ────────────────────────────────────────────────────────────────

    def delete_document_chunks(self, document_id: str) -> None:
        """Delete all vectors belonging to a given document."""
        if not self.available:
            return
        try:
            self._index.delete(filter={"document_id": {"$eq": document_id}})
        except Exception as exc:
            logger.error("Pinecone delete for doc %s failed: %s", document_id, exc)

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_index_stats(self) -> Dict[str, Any]:
        if not self.available:
            return {"available": False}
        try:
            stats = self._index.describe_index_stats()
            return dict(stats)
        except Exception as exc:
            logger.error("Pinecone stats failed: %s", exc)
            return {"available": True, "error": str(exc)}


# Module-level singleton
pinecone_client = PineconeClient()
