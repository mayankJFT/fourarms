"""Groq LLM client singleton with retry logic."""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_BASE_DELAY = 1.0  # seconds


class GroqClient:
    """Singleton wrapper around the Groq Python SDK."""

    _instance: Optional["GroqClient"] = None

    def __new__(cls) -> "GroqClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._client = None
        return cls._instance

    def _get_client(self):
        if self._client is None:
            from groq import Groq
            self._client = Groq(api_key=settings.GROQ_API_KEY)
        return self._client

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
    ) -> str:
        """
        Call the Groq chat API with exponential backoff on rate limit errors.

        Returns the assistant message content as a string.
        Raises RuntimeError if all retries are exhausted.
        """
        client = self._get_client()
        chosen_model = model or settings.GROQ_MODEL
        last_exc: Optional[Exception] = None

        for attempt in range(_MAX_RETRIES):
            try:
                response = client.chat.completions.create(
                    model=chosen_model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                return response.choices[0].message.content or ""
            except Exception as exc:
                exc_str = str(exc).lower()
                is_rate_limit = "rate" in exc_str or "429" in exc_str or "quota" in exc_str
                last_exc = exc

                if is_rate_limit and attempt < _MAX_RETRIES - 1:
                    delay = _BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "Groq rate limit hit (attempt %d/%d). Retrying in %.1fs…",
                        attempt + 1,
                        _MAX_RETRIES,
                        delay,
                    )
                    time.sleep(delay)
                else:
                    logger.error("Groq API error (attempt %d): %s", attempt + 1, exc)
                    if attempt == _MAX_RETRIES - 1:
                        break

        raise RuntimeError(f"Groq API failed after {_MAX_RETRIES} attempts: {last_exc}")


# Module-level singleton
groq_client = GroqClient()
