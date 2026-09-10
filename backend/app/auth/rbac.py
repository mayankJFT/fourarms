"""Role-based access control helpers and Pinecone filter builder."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.auth.jwt_utils import get_current_active_user

# ─────────────────────────────────────────────────────────────────────────────
# Role constants
# ─────────────────────────────────────────────────────────────────────────────

SUPER_ADMIN = "SUPER_ADMIN"
BOARD_ADMIN = "BOARD_ADMIN"
STANDARD_USER = "STANDARD_USER"
TENDER_AUTHOR = "TENDER_AUTHOR"

ALL_ROLES = [SUPER_ADMIN, BOARD_ADMIN, STANDARD_USER, TENDER_AUTHOR]


# ─────────────────────────────────────────────────────────────────────────────
# Dependency factory
# ─────────────────────────────────────────────────────────────────────────────

def require_role(*roles: str):
    """
    Return a FastAPI dependency that passes when the current user's role
    is included in *roles*, otherwise raises HTTP 403.
    """

    async def _check(current_user=Depends(get_current_active_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not permitted for this action. "
                       f"Required: {list(roles)}",
            )
        return current_user

    return _check


# ─────────────────────────────────────────────────────────────────────────────
# Pinecone metadata filter builder
# ─────────────────────────────────────────────────────────────────────────────

def build_pinecone_filter(user, db=None) -> dict:
    """
    Build a Pinecone metadata filter dict appropriate for *user*'s role.

    SUPER_ADMIN    → no restriction (sees everything: any confidentiality level,
                     division, or category, including HR data)
    everyone else  → their own uploads, plus any document explicitly shared with
                     them (see DocumentShare / POST .../share) — no implicit
                     sharing by division or confidentiality
    """
    if user.role == SUPER_ADMIN:
        return {}

    conditions = [{"owner_user_id": {"$eq": str(user.id)}}]

    if db is not None:
        from app.documents.models import DocumentShare
        shared_doc_ids = [
            row[0] for row in
            db.query(DocumentShare.document_id).filter(DocumentShare.shared_with_user_id == user.id).all()
        ]
        if shared_doc_ids:
            conditions.append({"document_id": {"$in": shared_doc_ids}})

    return conditions[0] if len(conditions) == 1 else {"$or": conditions}
