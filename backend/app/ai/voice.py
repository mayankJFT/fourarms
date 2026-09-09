"""Deepgram-powered voice transcription for Pillar 1 voice input.

Supports English, Hindi, and Hinglish as required by the RFP.
Transcription is returned as text for user confirmation before
the RAG pipeline processes it.
"""

import tempfile
import os
from pathlib import Path
from typing import Optional

import httpx

from app.config import settings


DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"

# Language codes supported for QCI voice input
SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "hi-Latn": "Hinglish",  # Hindi written in Latin script
}

# Deepgram model — nova-2 supports multilingual including Hindi
DEEPGRAM_MODEL = "nova-2"


async def transcribe_audio(
    audio_bytes: bytes,
    content_type: str = "audio/wav",
    language: Optional[str] = None,
) -> dict:
    """Transcribe audio bytes using the Deepgram API.

    Args:
        audio_bytes: Raw audio file content (wav, mp3, webm, ogg, m4a).
        content_type: MIME type of the audio file.
        language: Optional language hint ('en', 'hi', 'hi-Latn').
                  If None, Deepgram auto-detects.

    Returns:
        {
          "transcript": str,          # full transcription text
          "confidence": float,        # 0.0–1.0
          "detected_language": str,   # detected language code
          "words": list[dict],        # word-level timestamps (optional)
        }

    Raises:
        RuntimeError: if the Deepgram API call fails.
    """
    if not settings.DEEPGRAM_API_KEY:
        raise RuntimeError(
            "DEEPGRAM_API_KEY is not configured. "
            "Add it to your .env file to enable voice input."
        )

    params = {
        "model": DEEPGRAM_MODEL,
        "smart_format": "true",
        "punctuate": "true",
        "diarize": "false",
        "utterances": "false",
    }

    # Add language hint if provided; otherwise let Deepgram detect
    if language and language in SUPPORTED_LANGUAGES:
        params["language"] = language
    else:
        params["detect_language"] = "true"

    headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        "Content-Type": content_type,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            DEEPGRAM_URL,
            params=params,
            headers=headers,
            content=audio_bytes,
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"Deepgram API error {response.status_code}: {response.text}"
        )

    data = response.json()

    try:
        channel = data["results"]["channels"][0]
        alternative = channel["alternatives"][0]
        transcript = alternative.get("transcript", "").strip()
        confidence = alternative.get("confidence", 0.0)
        words = alternative.get("words", [])
        detected_language = data["results"].get("detected_language", language or "en")
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"Unexpected Deepgram response format: {exc}") from exc

    return {
        "transcript": transcript,
        "confidence": confidence,
        "detected_language": detected_language,
        "words": words,
    }


async def transcribe_upload(file_bytes: bytes, filename: str, language: Optional[str] = None) -> dict:
    """Detect content-type from filename extension and transcribe."""
    ext = Path(filename).suffix.lower()
    mime_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".mp4": "audio/mp4",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".webm": "audio/webm",
        ".flac": "audio/flac",
    }
    content_type = mime_map.get(ext, "audio/wav")
    return await transcribe_audio(file_bytes, content_type, language)
