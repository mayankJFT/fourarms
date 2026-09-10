"""Application configuration loaded from environment / .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM provider ─────────────────────────────────────────────────────
    # "groq" or "openai" — selects which client app.ai.llm_client dispatches to.
    LLM_PROVIDER: str = "groq"

    # ── Groq LLM ──────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.1-70b-versatile"

    # ── OpenAI LLM ───────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini-2024-07-18"

    # ── Embedding provider ───────────────────────────────────────────────
    # "local" (sentence-transformers/all-MiniLM-L6-v2, 384-dim) or "openai"
    # (text-embedding-ada-002, 1536-dim). Changing this requires the Pinecone
    # index to be recreated at the new dimension — see app/documents/embeddings.py.
    EMBEDDING_PROVIDER: str = "local"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-ada-002"

    # ── Pinecone ───────────────────────────────────────────────────────
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "qci-knowledge-hub"
    PINECONE_ENV: str = "us-east-1"

    # ── Deepgram (Speech-to-Text) ──────────────────────────────────────
    # Used for voice input: English, Hindi, Hinglish transcription
    DEEPGRAM_API_KEY: str = ""

    # ── MongoDB ────────────────────────────────────────────────────────
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "qci_knowledge_hub"

    # ── JWT ────────────────────────────────────────────────────────────
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # ── Database (SQLite fallback for local dev) ───────────────────────
    SQLITE_URL: str = "sqlite:///./qci_hub.db"

    # ── File storage ───────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"

    # ── Seed admin ─────────────────────────────────────────────────────
    SEED_ADMIN_EMAIL: str = "admin@qci.gov.in"
    SEED_ADMIN_PASSWORD: str = "Admin@QCI2026"

    # ── Organisation identity ────────────────────────────────────────────
    # Used as "our" organisation when the AI authors documents (system prompt,
    # DOCX header/footer). Previously hardcoded inline in app/ai/generator.py
    # as "QCI (Queensland Construction Inspections)" — a fabricated expansion
    # that didn't match anything else in the project. Configurable here
    # instead of a magic string; the real author of generated proposals is
    # Jellyfish Technologies, not QCI (QCI is the client this Knowledge Hub
    # tool itself was built for — see README — a separate identity).
    ORG_SHORT_NAME: str = "JFT"
    ORG_FULL_NAME: str = "Jellyfish Technologies"

    # ── RAG tuning ─────────────────────────────────────────────────────
    RELEVANCE_THRESHOLD: float = 0.35
    RAG_TOP_K: int = 8
    CHUNK_SIZE_TOKENS: int = 512
    CHUNK_OVERLAP_TOKENS: int = 64

    # ── OCR / legacy-format conversion ──────────────────────────────────
    # Leave unset to use the system PATH (normal install). Set these when
    # tesseract is only available as a local extraction (no root access) —
    # see backend/.local-tools/tesseract.
    TESSERACT_CMD: str = ""
    TESSDATA_PREFIX: str = ""
    # Path to the LibreOffice binary used to convert legacy .doc/.ppt/.xls
    # to their OOXML equivalents before extraction. Empty = look up "soffice"/
    # "libreoffice" on PATH.
    SOFFICE_CMD: str = ""


settings = Settings()
