"""
OCR Resume Parser - STUB (Disabled)
----------------------------------
Local OCR dependencies (Tesseract/OpenCV) have been removed.
Resume parsing is handled via Gemini LLM.
"""

from typing import Dict, Any
from loguru import logger

class OCRResumeParser:
    """Stub class for OCR parsing to prevent crashes while dependencies are removed"""

    def __init__(self):
        self.ocr_enabled = False
        logger.info("ℹ️ Local OCR service is disabled (Dependencies removed). Using LLM-based extraction.")

    async def parse_file(self, file_path: str, filename: str) -> Dict[str, Any]:
        """OCR is disabled, this will now raise a descriptive error or could be extended to use Gemini Vision"""
        raise RuntimeError(
            f"Local OCR is disabled for {filename}. "
            "Please use the Gemini-based PDF parser for text-based documents."
        )

    def check_tesseract_installed(self) -> bool:
        return False

    def get_supported_languages(self) -> list:
        return ["eng"]

    async def extract_text(self, file_path: str) -> str:
        raise RuntimeError("Local OCR text extraction is disabled.")

# Backward compatibility alias
OCRParser = OCRResumeParser
