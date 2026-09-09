"""Authentication and user management endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.audit.logger import log_event
from app.auth.jwt_utils import create_access_token, get_current_active_user
from app.auth.models import Token, User, UserCreate, UserLogin, UserOut, UserUpdate
from app.auth.rbac import BOARD_ADMIN, SUPER_ADMIN, require_role
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─────────────────────────────────────────────────────────────────────────────
# Register
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=_hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        division=body.division,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_event(
        db=db,
        user_id=user.id,
        user_email=user.email,
        action="USER_REGISTER",
        resource_type="User",
        resource_id=str(user.id),
        ip_address=request.client.host if request.client else None,
    )
    return user


# ─────────────────────────────────────────────────────────────────────────────
# Login
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
async def login(
    body: UserLogin,
    request: Request,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    user.last_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    log_event(
        db=db,
        user_id=user.id,
        user_email=user.email,
        action="USER_LOGIN",
        resource_type="User",
        resource_id=str(user.id),
        ip_address=request.client.host if request.client else None,
    )
    return Token(access_token=token, user=UserOut.model_validate(user))


# ─────────────────────────────────────────────────────────────────────────────
# Current user
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_active_user)):
    return current_user


# ─────────────────────────────────────────────────────────────────────────────
# List users (SUPER_ADMIN + BOARD_ADMIN)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
async def list_users(
    current_user: User = Depends(require_role(SUPER_ADMIN, BOARD_ADMIN)),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if current_user.role == BOARD_ADMIN:
        # Board admins only see users in their own division
        query = query.filter(User.division == current_user.division)
    return query.all()


# ─────────────────────────────────────────────────────────────────────────────
# Update role (SUPER_ADMIN only)
# ─────────────────────────────────────────────────────────────────────────────

@router.put("/users/{user_id}/role", response_model=UserOut)
async def update_role(
    user_id: int,
    body: dict,
    request: Request,
    current_user: User = Depends(require_role(SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_role = body.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="'role' field required")

    old_role = user.role
    user.role = new_role
    db.commit()
    db.refresh(user)

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="USER_ROLE_CHANGE",
        resource_type="User",
        resource_id=str(user_id),
        detail={"old_role": old_role, "new_role": new_role},
        ip_address=request.client.host if request.client else None,
    )
    return user


# ─────────────────────────────────────────────────────────────────────────────
# Activate / deactivate (SUPER_ADMIN only)
# ─────────────────────────────────────────────────────────────────────────────

@router.put("/users/{user_id}/activate", response_model=UserOut)
async def set_active(
    user_id: int,
    body: dict,
    request: Request,
    current_user: User = Depends(require_role(SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_active = body.get("is_active")
    if is_active is None:
        raise HTTPException(status_code=400, detail="'is_active' field required")

    user.is_active = bool(is_active)
    db.commit()
    db.refresh(user)

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="USER_ACTIVATE" if user.is_active else "USER_DEACTIVATE",
        resource_type="User",
        resource_id=str(user_id),
        ip_address=request.client.host if request.client else None,
    )
    return user


# ─────────────────────────────────────────────────────────────────────────────
# Delete user (SUPER_ADMIN only)
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_role(SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    db.delete(user)
    db.commit()

    log_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="USER_DELETE",
        resource_type="User",
        resource_id=str(user_id),
        ip_address=request.client.host if request.client else None,
    )
