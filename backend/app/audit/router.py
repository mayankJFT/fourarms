"""Audit log query and export endpoints."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.audit.models import AuditLog
from app.auth.jwt_utils import get_current_active_user
from app.auth.models import User
from app.auth.rbac import BOARD_ADMIN, SUPER_ADMIN, require_role
from app.database import get_db

router = APIRouter(prefix="/audit", tags=["audit"])


def _build_audit_query(
    db: Session,
    current_user: User,
    user_id: Optional[int],
    action: Optional[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
):
    q = db.query(AuditLog)

    if current_user.role == BOARD_ADMIN:
        # Board admin sees logs for users in their own division only
        # We filter by known user IDs — a join would be cleaner but this
        # keeps the audit module independent of the users table.
        from app.auth.models import User as UserModel
        division_user_ids = [
            u.id
            for u in db.query(UserModel).filter(UserModel.division == current_user.division).all()
        ]
        division_user_ids.append(current_user.id)
        q = q.filter(AuditLog.user_id.in_(division_user_ids))
    # SUPER_ADMIN sees everything (no additional filter)

    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if start_date:
        q = q.filter(AuditLog.timestamp >= start_date)
    if end_date:
        q = q.filter(AuditLog.timestamp <= end_date)

    return q.order_by(AuditLog.timestamp.desc())


# ── List logs ─────────────────────────────────────────────────────────────────

@router.get("/logs")
async def list_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_role(SUPER_ADMIN, BOARD_ADMIN)),
    db: Session = Depends(get_db),
):
    q = _build_audit_query(db, current_user, user_id, action, start_date, end_date)
    offset = (page - 1) * limit
    rows = q.offset(offset).limit(limit).all()

    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "user_email": r.user_email,
            "action": r.action,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "detail": json.loads(r.detail) if r.detail else None,
            "ip_address": r.ip_address,
            "timestamp": r.timestamp.isoformat(),
        }
        for r in rows
    ]


# ── Export CSV ────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(require_role(SUPER_ADMIN, BOARD_ADMIN)),
    db: Session = Depends(get_db),
):
    q = _build_audit_query(db, current_user, user_id, action, start_date, end_date)
    rows = q.all()

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["id", "timestamp", "user_id", "user_email", "action", "resource_type", "resource_id", "detail", "ip_address"]
        )
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        for r in rows:
            writer.writerow([
                r.id,
                r.timestamp.isoformat(),
                r.user_id or "",
                r.user_email,
                r.action,
                r.resource_type or "",
                r.resource_id or "",
                r.detail or "",
                r.ip_address or "",
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    headers = {"Content-Disposition": "attachment; filename=audit_logs.csv"}
    return StreamingResponse(generate(), media_type="text/csv", headers=headers)
