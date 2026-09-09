"""Application configuration loaded from environment / .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Groq LLM ──────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.1-70b-versatile"

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

    # ── RAG tuning ─────────────────────────────────────────────────────
    RELEVANCE_THRESHOLD: float = 0.35
    RAG_TOP_K: int = 8
    CHUNK_SIZE_TOKENS: int = 512
    CHUNK_OVERLAP_TOKENS: int = 64


settings = Settings()
