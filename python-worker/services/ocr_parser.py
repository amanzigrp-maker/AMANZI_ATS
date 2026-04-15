"""
OCR Resume Parser - Extract text from image resumes
Supports: JPG, PNG, scanned PDFs
Uses: Tesseract OCR + OpenCV preprocessing

Production‑ready:
- Auto‑detects Tesseract (no manual PATH needed)
- TRUE singleton (Tesseract detected only once)
- Cleanly disables OCR if missing
- Safe for one‑command startup
"""

import cv2
import numpy as np
from PIL import Image
import pytesseract
from typing import Dict, Any
from pathlib import Path
from loguru import logger
import fitz  # PyMuPDF
from datetime import datetime
from config import settings
import shutil

# ------------------------------------------------------------------
# Singleton instance (avoid multiple OCR initializations)
# ------------------------------------------------------------------
_OCR_INSTANCE = None


class OCRResumeParser:
    """Parse resumes from images using OCR (auto‑configured, singleton)"""

    def __init__(self):
        global _OCR_INSTANCE

        # If already initialized once, reuse state
        if _OCR_INSTANCE is not None:
            self.ocr_enabled = _OCR_INSTANCE.ocr_enabled
            return

        # First‑time setup
        self.ocr_enabled = self._setup_tesseract()
        _OCR_INSTANCE = self

    # ---------------------------------------------------------
    # TESSERACT AUTO SETUP
    # ---------------------------------------------------------

    def _setup_tesseract(self) -> bool:
        """Auto‑detect and configure Tesseract OCR"""

        # 1. Try from system PATH
        tesseract_cmd = shutil.which("tesseract")

        # 2. Try common Windows installation paths
        if not tesseract_cmd:
            possible_paths = [
                r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
                r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
                r"C:\\Tesseract-OCR\\tesseract.exe",
            ]
            for path in possible_paths:
                if Path(path).exists():
                    tesseract_cmd = path
                    break

        # 3. Configure or disable OCR
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
            logger.success(f"✅ Tesseract detected: {tesseract_cmd}")
            return True
        else:
            logger.warning("⚠️ Tesseract not found → OCR disabled")
            logger.warning("➡️ Install from: https://github.com/UB-Mannheim/tesseract/wiki")
            return False

    # ---------------------------------------------------------
    # PATH SAFETY
    # ---------------------------------------------------------

    def _ensure_abs_under_storage(self, path_str: str) -> str:
        """Normalize file path safely under storage directory"""
        p = Path(path_str)

        if p.is_absolute():
            return str(p)

        parts = p.parts
        if parts and parts[0].lower() == "storage":
            p = Path(*parts[1:])

        return str((settings.storage_path / p).resolve())

    # ---------------------------------------------------------
    # MAIN ENTRY
    # ---------------------------------------------------------

    async def parse_file(self, file_path: str, filename: str) -> Dict[str, Any]:
        """Parse resume file using OCR"""

        if not self.ocr_enabled:
            raise RuntimeError("OCR requested but Tesseract is not installed")

        try:
            logger.info(f"🖼️ OCR parsing started: {filename}")

            file_ext = Path(filename).suffix.lower()
            abs_path = self._ensure_abs_under_storage(file_path)

            # Select extraction method
            if file_ext == ".pdf":
                raw_text = await self._extract_from_scanned_pdf(abs_path)
            elif file_ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
                raw_text = await self._extract_from_image(abs_path)
            else:
                raise ValueError(f"Unsupported file type for OCR: {file_ext}")

            if not raw_text or len(raw_text.strip()) < 50:
                raise ValueError("OCR failed to extract meaningful text")

            logger.success(f"✅ OCR extracted {len(raw_text)} characters")

            return {
                "raw_text": raw_text,
                "filename": filename,
                "file_type": file_ext,
                "extraction_method": "ocr",
                "parsed_at": datetime.utcnow().isoformat(),
                "text_length": len(raw_text),
            }

        except Exception as e:
            logger.error(f"❌ OCR parsing failed for {filename}: {e}")
            raise

    # ---------------------------------------------------------
    # IMAGE OCR
    # ---------------------------------------------------------

    async def _extract_from_image(self, file_path: str) -> str:
        """Extract text from image file using OCR"""

        if not self.ocr_enabled:
            raise RuntimeError("Tesseract not available")

        try:
            file_path = self._ensure_abs_under_storage(file_path)

            image = cv2.imread(file_path)
            if image is None:
                raise ValueError("Failed to read image file")

            processed_image = self._preprocess_image(image)
            text = pytesseract.image_to_string(processed_image, lang="eng")

            return text.strip()

        except Exception as e:
            logger.warning(f"Primary OCR failed, trying fallback: {e}")

            # Fallback without preprocessing
            try:
                pil_image = Image.open(file_path)
                text = pytesseract.image_to_string(pil_image, lang="eng")
                return text.strip()
            except Exception as e2:
                logger.error(f"Fallback OCR failed: {e2}")
                raise

    # ---------------------------------------------------------
    # SCANNED PDF OCR
    # ---------------------------------------------------------

    async def _extract_from_scanned_pdf(self, file_path: str) -> str:
        """Extract text from scanned PDF using OCR"""

        if not self.ocr_enabled:
            raise RuntimeError("Tesseract not available")

        try:
            file_path = self._ensure_abs_under_storage(file_path)
            doc = fitz.open(file_path)

            text_parts = []

            for page_num, page in enumerate(doc):
                logger.info(f"   📄 Processing page {page_num + 1}/{len(doc)}")

                # Try normal text extraction first
                text = page.get_text("text").strip()

                # If empty → scanned page → OCR
                if not text or len(text) < 50:
                    logger.info(f"   🔍 Page {page_num + 1} scanned, running OCR...")

                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img_data = pix.tobytes("png")

                    nparr = np.frombuffer(img_data, np.uint8)
                    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    processed_image = self._preprocess_image(image)
                    text = pytesseract.image_to_string(processed_image, lang="eng")

                if text.strip():
                    text_parts.append(text)

            doc.close()

            return "\n".join(text_parts).strip()

        except Exception as e:
            logger.error(f"❌ Scanned PDF OCR failed: {e}")
            raise

    # ---------------------------------------------------------
    # IMAGE PREPROCESSING
    # ---------------------------------------------------------

    def _preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """Improve image quality before OCR"""

        try:
            # Grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

            # Denoise
            denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)

            # Adaptive threshold
            thresh = cv2.adaptiveThreshold(
                denoised,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                11,
                2,
            )

            # Deskew
            deskewed = self._deskew_image(thresh)

            # Morphological cleanup
            kernel = np.ones((1, 1), np.uint8)
            cleaned = cv2.morphologyEx(deskewed, cv2.MORPH_CLOSE, kernel)

            return cleaned

        except Exception as e:
            logger.warning(f"Preprocessing failed, using original image: {e}")
            return image

    # ---------------------------------------------------------
    # DESKEW
    # ---------------------------------------------------------

    def _deskew_image(self, image: np.ndarray) -> np.ndarray:
        """Deskew rotated scanned images"""

        try:
            edges = cv2.Canny(image, 50, 150, apertureSize=3)
            lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)

            if lines is not None and len(lines) > 0:
                angles = []
                for line in lines[:10]:
                    rho, theta = line[0]
                    angle = np.degrees(theta) - 90
                    angles.append(angle)

                median_angle = np.median(angles)

                if abs(median_angle) > 0.5:
                    (h, w) = image.shape[:2]
                    center = (w // 2, h // 2)
                    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
                    rotated = cv2.warpAffine(
                        image,
                        M,
                        (w, h),
                        flags=cv2.INTER_CUBIC,
                        borderMode=cv2.BORDER_REPLICATE,
                    )
                    return rotated

            return image

        except Exception as e:
            logger.warning(f"Deskew failed: {e}")
            return image

    # ---------------------------------------------------------
    # UTILITIES
    # ---------------------------------------------------------

    def check_tesseract_installed(self) -> bool:
        """Check if Tesseract is available"""
        return self.ocr_enabled

    def get_supported_languages(self) -> list:
        """Get installed OCR languages"""
        try:
            return pytesseract.get_languages()
        except Exception:
            return ["eng"]

    async def extract_text(self, file_path: str) -> str:
        """Simple OCR extraction helper"""

        if not self.ocr_enabled:
            raise RuntimeError("OCR requested but Tesseract is not installed")

        try:
            file_path = self._ensure_abs_under_storage(file_path)
            file_ext = Path(file_path).suffix.lower()

            if file_ext == ".pdf":
                return await self._extract_from_scanned_pdf(file_path)
            elif file_ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
                return await self._extract_from_image(file_path)
            else:
                raise ValueError(f"Unsupported file type for OCR: {file_ext}")

        except Exception as e:
            logger.error(f"OCR text extraction failed: {e}")
            raise


# Backward compatibility alias
OCRParser = OCRResumeParser
