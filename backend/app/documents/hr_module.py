"""HR CSV ingestion module."""

from __future__ import annotations

import csv
import json
import logging
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.documents.models import HRRecord
from app.documents.pinecone_client import pinecone_client

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {
    "employee_id",
    "name",
    "qualifications",
    "years_experience",
    "current_bandwidth_pct",
    "project_history",
    "availability_date",
    "location",
}


def _parse_date(value: str) -> Optional[date]:
    if not value or value.strip().lower() in ("", "none", "null", "n/a"):
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            pass
    return None


def _build_hr_text(row: dict) -> str:
    """Build a natural-language representation of an HR record for embedding."""
    return (
        f"Employee: {row.get('name', '')}. "
        f"Qualifications: {row.get('qualifications', '')}. "
        f"Years of experience: {row.get('years_experience', 0)}. "
        f"Current bandwidth: {row.get('current_bandwidth_pct', 100)}%. "
        f"Location: {row.get('location', '')}. "
        f"Project history: {row.get('project_history', '')}."
    )


def ingest_hr_csv(file_path: str, uploader_id: int, db: Session) -> int:
    """
    Parse an HR CSV and upsert records into SQLite and Pinecone.

    Returns the number of records successfully processed.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"HR CSV not found: {file_path}")

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError("CSV has no headers")

        # Normalise header names (lowercase, strip whitespace)
        normalised_headers = {h.strip().lower() for h in reader.fieldnames if h}
        missing = REQUIRED_COLUMNS - normalised_headers
        if missing:
            raise ValueError(f"HR CSV missing required columns: {missing}")

        rows = list(reader)

    # Lazy-load embedding model
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")

    processed = 0
    pinecone_vectors = []

    for row in rows:
        # Normalise keys
        row = {k.strip().lower(): v.strip() if isinstance(v, str) else v for k, v in row.items()}

        employee_id = row.get("employee_id", "").strip()
        if not employee_id:
            logger.warning("Skipping HR row with missing employee_id")
            continue

        try:
            years_exp = float(row.get("years_experience", 0) or 0)
            bandwidth = float(row.get("current_bandwidth_pct", 100) or 100)
        except (ValueError, TypeError):
            years_exp = 0.0
            bandwidth = 100.0

        avail_date = _parse_date(row.get("availability_date", ""))

        project_history_raw = row.get("project_history", "")
        # Try to interpret as JSON; otherwise store as plain string
        try:
            ph_json = json.dumps(json.loads(project_history_raw))
        except (json.JSONDecodeError, TypeError):
            ph_json = json.dumps([project_history_raw]) if project_history_raw else json.dumps([])

        # Upsert into SQLite
        existing = db.query(HRRecord).filter(HRRecord.employee_id == employee_id).first()
        if existing:
            existing.name = row.get("name", "")
            existing.qualifications = row.get("qualifications", "")
            existing.years_experience = years_exp
            existing.current_bandwidth_pct = bandwidth
            existing.project_history = ph_json
            existing.availability_date = avail_date
            existing.location = row.get("location", "")
            existing.ingested_by = uploader_id
            existing.ingested_at = datetime.now(timezone.utc)
            record = existing
        else:
            record = HRRecord(
                employee_id=employee_id,
                name=row.get("name", ""),
                qualifications=row.get("qualifications", ""),
                years_experience=years_exp,
                current_bandwidth_pct=bandwidth,
                project_history=ph_json,
                availability_date=avail_date,
                location=row.get("location", ""),
                ingested_by=uploader_id,
            )
            db.add(record)

        try:
            db.flush()
        except Exception as exc:
            logger.error("DB flush failed for employee %s: %s", employee_id, exc)
            db.rollback()
            continue

        # Build Pinecone vector
        text = _build_hr_text(row)
        try:
            embedding = model.encode([text])[0].tolist()
            vector_id = f"hr-{employee_id}"
            pinecone_vectors.append({
                "id": vector_id,
                "values": embedding,
                "metadata": {
                    "document_id": f"hr-{employee_id}",
                    "owner_user_id": str(uploader_id),
                    "is_hr_data": True,
                    "employee_id": employee_id,
                    "name": row.get("name", ""),
                    "qualifications": row.get("qualifications", ""),
                    "years_experience": years_exp,
                    "current_bandwidth_pct": bandwidth,
                    "location": row.get("location", ""),
                    "availability_date": row.get("availability_date", ""),
                    "text_preview": text[:200],
                    "confidentiality": "CONFIDENTIAL",
                    "division": "HR",
                },
            })
        except Exception as exc:
            logger.error("Embedding failed for employee %s: %s", employee_id, exc)

        processed += 1

    db.commit()

    # Upsert all HR vectors to Pinecone
    if pinecone_vectors:
        pinecone_client.upsert_chunks(pinecone_vectors)

    logger.info("HR ingestion complete: %d records processed from %s", processed, file_path)
    return processed
