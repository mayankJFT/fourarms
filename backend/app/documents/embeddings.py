"""Text embedding generation. Dispatches to local sentence-transformers or
OpenAI's embeddings API based on settings.EMBEDDING_PROVIDER.

IMPORTANT: a Pinecone index's vector dimension is fixed at creation time.
Switching EMBEDDING_PROVIDER requires the index to be recreated at the new
dimension (see get_embedding_dimension() / pinecone_client.init_pinecone) and
every existing document re-ingested — old vectors are not compatible with a
different embedding model's dimensionality.
"""

from __future__ import annotations

from typing import List

from app.config import settings

_EMBEDDING_DIMENSIONS = {"local": 384, "openai": 1536}

_local_model = None
_openai_client = None


def get_embedding_dimension() -> int:
    return _EMBEDDING_DIMENSIONS.get(settings.EMBEDDING_PROVIDER.strip().lower(), 384)


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a batch of strings. Returns one vector per input, same order."""
    if not texts:
        return []
    provider = settings.EMBEDDING_PROVIDER.strip().lower()
    if provider == "openai":
        return _embed_openai(texts)
    return _embed_local(texts)


def _embed_local(texts: List[str]) -> List[List[float]]:
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        _local_model = SentenceTransformer("all-MiniLM-L6-v2")
    return [v.tolist() for v in _local_model.encode(texts, batch_size=32, show_progress_bar=False)]


def _embed_openai(texts: List[str]) -> List[List[float]]:
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

    # ada-002 accepts batched input; keep batches modest to stay well under
    # its ~8191-token-per-request practical limits for long documents.
    all_vectors: List[List[float]] = []
    batch_size = 96
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = _openai_client.embeddings.create(model=settings.OPENAI_EMBEDDING_MODEL, input=batch)
        all_vectors.extend(d.embedding for d in response.data)
    return all_vectors
