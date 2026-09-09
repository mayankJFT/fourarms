"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import Base, SessionLocal, engine

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # ── Startup ───────────────────────────────────────────────────────────────
    logger.info("QCI AI Knowledge Hub – starting up…")

    # 1. Create all SQLite tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created / verified")

    # 2. Initialise Pinecone
    try:
        from app.documents.pinecone_client import pinecone_client
        pinecone_client.init_pinecone()
    except Exception as exc:
        logger.warning("Pinecone init skipped: %s", exc)

    # 3. Warm up embedding model
    try:
        from app.documents.ingestion import get_embedding_model
        get_embedding_model()
        logger.info("Embedding model loaded")
    except Exception as exc:
        logger.warning("Embedding model warm-up failed: %s", exc)

    # 4. Seed SUPER_ADMIN if no users exist
    _seed_admin()

    logger.info("Startup complete")
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("QCI AI Knowledge Hub – shutting down")


def _seed_admin() -> None:
    """Create the initial SUPER_ADMIN account if the users table is empty."""
    from app.auth.models import User
    from passlib.context import CryptContext

    db = SessionLocal()
    try:
        count = db.query(User).count()
        if count == 0 and settings.SEED_ADMIN_EMAIL:
            pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
            admin = User(
                email=settings.SEED_ADMIN_EMAIL,
                hashed_password=pwd_ctx.hash(settings.SEED_ADMIN_PASSWORD),
                full_name="System Administrator",
                role="SUPER_ADMIN",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            logger.info("Seeded SUPER_ADMIN: %s", settings.SEED_ADMIN_EMAIL)
    except Exception as exc:
        logger.error("Admin seed failed: %s", exc)
        db.rollback()
    finally:
        db.close()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="QCI AI Knowledge Hub",
    description="AI-powered document management and knowledge retrieval system for QCI.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS – allow all origins for PoC; tighten in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

from app.auth.router import router as auth_router
from app.documents.router import router as documents_router
from app.ai.router import router as ai_router
from app.workflow.router import router as workflow_router
from app.audit.router import router as audit_router

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(ai_router)
app.include_router(workflow_router)
app.include_router(audit_router)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health_check():
    """Return service health status including DB and Pinecone connectivity."""
    db_status = "connected"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"error: {exc}"

    pinecone_status = "connected"
    try:
        from app.documents.pinecone_client import pinecone_client
        if not pinecone_client.available:
            pinecone_status = "not configured"
        else:
            pinecone_client.get_index_stats()
    except Exception as exc:
        pinecone_status = f"error: {exc}"

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "db": db_status,
        "pinecone": pinecone_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
