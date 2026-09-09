"""Audit logging helper."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.audit.models import AuditLog

logger = logging.getLogger(__name__)


def log_event(
    db: Session,
    user_id: Optional[int],
    user_email: str,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    detail: Optional[Any] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Create and persist an AuditLog record.

    *detail* can be any JSON-serialisable value (dict, list, str, …).
    Errors are caught and logged rather than propagated so that audit
    failures never break the main request flow.
    """
    try:
        detail_str: Optional[str] = None
        if detail is not None:
            detail_str = json.dumps(detail, default=str)

        entry = AuditLog(
            user_id=user_id,
            user_email=user_email or "",
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            detail=detail_str,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        logger.error("Failed to write audit log [%s]: %s", action, exc)
        try:
            db.rollback()
        except Exception:
            pass
