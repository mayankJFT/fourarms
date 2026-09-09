"""MongoDB async client using Motor.

Collections mirror the SQLAlchemy models used in the SQLite layer.
Both data stores coexist in the PoC — SQLite handles relational
auth/workflow state; MongoDB stores conversation history and
audit logs (append-heavy, high-volume collections).
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGODB_URI)
    return _client


def get_mongo_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        _db = get_mongo_client()[settings.MONGODB_DB]
    return _db


async def init_mongo_indexes() -> None:
    """Create indexes on startup for performance-critical queries."""
    db = get_mongo_db()

    # Conversations — queried by user_id + updated_at desc
    await db.conversations.create_index([("user_id", 1), ("updated_at", -1)])

    # Messages — queried by session_id + created_at asc
    await db.messages.create_index([("session_id", 1), ("created_at", 1)])

    # Audit logs — queried by timestamp desc, user_email, action
    await db.audit_logs.create_index([("timestamp", -1)])
    await db.audit_logs.create_index([("user_email", 1), ("timestamp", -1)])
    await db.audit_logs.create_index([("action", 1), ("timestamp", -1)])


async def close_mongo() -> None:
    global _client
    if _client:
        _client.close()
        _client = None
