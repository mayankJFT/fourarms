"""Legacy Office format conversion via headless LibreOffice.

python-docx / python-pptx / openpyxl only read the modern OOXML formats
(.docx/.pptx/.xlsx). Legacy binary formats (.doc/.ppt/.xls) are converted to
their OOXML equivalent first, then handed to the same extractors.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# legacy extension -> OOXML target LibreOffice should convert to
_CONVERSION_TARGETS = {
    "doc": "docx",
    "ppt": "pptx",
    "xls": "xlsx",
}


def _soffice_cmd() -> Optional[str]:
    if settings.SOFFICE_CMD:
        return settings.SOFFICE_CMD
    return shutil.which("soffice") or shutil.which("libreoffice")


def is_legacy_office_format(file_type: str) -> bool:
    return file_type.lower().lstrip(".") in _CONVERSION_TARGETS


def convert_legacy_office_doc(file_path: str, file_type: str) -> str:
    """
    Convert a legacy .doc/.ppt/.xls file to its OOXML equivalent.

    Returns the path to the converted file (in a temp directory — caller does
    not need to clean it up beyond process lifetime). Raises RuntimeError with
    a human-readable message on failure, so ingestion can surface it instead
    of silently leaving the document stuck at "pending".
    """
    ft = file_type.lower().lstrip(".")
    target_ext = _CONVERSION_TARGETS.get(ft)
    if not target_ext:
        raise RuntimeError(f"No conversion target registered for legacy format '{ft}'")

    soffice = _soffice_cmd()
    if not soffice:
        raise RuntimeError(
            f"Cannot process legacy .{ft} files: LibreOffice (soffice) is not installed. "
            f"Install libreoffice, or re-save the file as .{target_ext} and re-upload."
        )

    out_dir = tempfile.mkdtemp(prefix="qci-office-convert-")
    try:
        result = subprocess.run(
            [
                soffice, "--headless", "--norestore",
                "--convert-to", target_ext,
                "--outdir", out_dir,
                file_path,
            ],
            capture_output=True,
            text=True,
            timeout=90,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"LibreOffice conversion timed out for {Path(file_path).name}") from exc

    if result.returncode != 0:
        logger.error("soffice conversion failed (rc=%s): %s", result.returncode, result.stderr)
        raise RuntimeError(f"LibreOffice failed to convert {Path(file_path).name}: {result.stderr.strip()[:300]}")

    converted_name = Path(file_path).stem + f".{target_ext}"
    converted_path = Path(out_dir) / converted_name
    if not converted_path.exists():
        # LibreOffice sometimes names output after the true stem even with odd input names —
        # fall back to whatever landed in out_dir.
        candidates = list(Path(out_dir).glob(f"*.{target_ext}"))
        if not candidates:
            raise RuntimeError(f"LibreOffice conversion produced no output for {Path(file_path).name}")
        converted_path = candidates[0]

    return str(converted_path)
