"""OCR utilities: scanned PDF detection and text extraction via pytesseract."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Tuple

logger = logging.getLogger(__name__)


def is_scanned_pdf(file_path: str) -> bool:
    """
    Return True if the PDF appears to be a scanned image rather than digital text.

    Heuristic: average character count per page < 50 means no extractable text.
    """
    try:
        import pdfplumber

        with pdfplumber.open(file_path) as pdf:
            if not pdf.pages:
                return True
            total_chars = 0
            for page in pdf.pages:
                text = page.extract_text() or ""
                total_chars += len(text)
            avg_chars = total_chars / len(pdf.pages)
            return avg_chars < 50
    except Exception as exc:
        logger.warning("is_scanned_pdf check failed for %s: %s", file_path, exc)
        return False


def ocr_pdf_pages(file_path: str) -> List[Tuple[int, str, float]]:
    """
    Convert each PDF page to an image and run pytesseract OCR on it.

    Returns a list of (page_num, extracted_text, confidence) tuples.
    Confidence is the mean word-level confidence reported by tesseract (0-100).
    """
    results: List[Tuple[int, str, float]] = []

    try:
        from pdf2image import convert_from_path
        from PIL import ImageEnhance
        import pytesseract

        pages = convert_from_path(file_path, dpi=300)
    except Exception as exc:
        logger.error("pdf2image conversion failed for %s: %s", file_path, exc)
        return results

    for page_num, pil_image in enumerate(pages, start=1):
        try:
            # Pre-processing: convert to greyscale and boost contrast
            grey = pil_image.convert("L")
            enhancer = ImageEnhance.Contrast(grey)
            enhanced = enhancer.enhance(2.0)

            # Extract text
            text: str = pytesseract.image_to_string(enhanced, config="--psm 3")

            # Extract confidence scores per word
            try:
                data = pytesseract.image_to_data(
                    enhanced,
                    output_type=pytesseract.Output.DICT,
                    config="--psm 3",
                )
                confs = [int(c) for c in data["conf"] if str(c).lstrip("-").isdigit() and int(c) >= 0]
                confidence = sum(confs) / len(confs) if confs else 0.0
            except Exception:
                confidence = 0.0

            results.append((page_num, text, confidence))
        except Exception as exc:
            logger.warning("OCR failed on page %d of %s: %s", page_num, file_path, exc)
            results.append((page_num, "", 0.0))

    return results
