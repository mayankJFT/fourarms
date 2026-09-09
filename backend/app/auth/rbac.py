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

def build_pinecone_filter(user) -> dict:
    """
    Build a Pinecone metadata filter dict appropriate for *user*'s role.

    SUPER_ADMIN   → no restriction (sees everything)
    TENDER_AUTHOR → can see HR data in addition to normal docs
    BOARD_ADMIN   → PUBLIC + INTERNAL docs, own division, own uploads, no HR
    STANDARD_USER → same as BOARD_ADMIN
    """
    role = user.role

    if role == SUPER_ADMIN:
        return {}

    if role == TENDER_AUTHOR:
        # May see all confidentiality levels and HR data
        return {
            "$or": [
                {"is_hr_data": {"$eq": True}},
                {
                    "$and": [
                        {"is_hr_data": {"$eq": False}},
                        {
                            "confidentiality": {
                                "$in": ["PUBLIC", "INTERNAL", "CONFIDENTIAL"]
                            }
                        },
                    ]
                },
            ]
        }

    # BOARD_ADMIN and STANDARD_USER
    conditions: list[dict] = [
        {"is_hr_data": {"$eq": False}},
        {"confidentiality": {"$in": ["PUBLIC", "INTERNAL"]}},
    ]

    role_filter: dict = {"$and": conditions}

    # Extend to allow own division docs or own uploaded docs
    division_conditions: list[dict] = []

    if user.division:
        division_conditions.append({"division": {"$eq": user.division}})

    # Own uploads
    division_conditions.append({"owner_user_id": {"$eq": str(user.id)}})

    if division_conditions:
        # Allow if base conditions met OR if it's own content
        role_filter = {
            "$or": [
                {"$and": conditions},
                *division_conditions,
            ]
        }

    return role_filter
