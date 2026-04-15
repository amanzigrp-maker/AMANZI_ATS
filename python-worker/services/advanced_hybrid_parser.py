"""
Advanced Hybrid Resume Parser - LLM ONLY (Gemini)
--------------------------------------------------
STRICT MODE:
- Gemini is the ONLY parser
- Regex used ONLY for validation / cleanup
- NO fallback parsing
- No GLiNER (CPU safe)
- No silent exits
"""

from typing import Dict, Any
from pathlib import Path
from loguru import logger

from services.improved_parser import ImprovedResumeParser
from services.excel_parser import ExcelResumeParser
from services.ocr_parser import OCRResumeParser
from services.text_preprocessor import TextPreprocessor
from services.indian_patterns import IndianPatternExtractor
from services.parsing_cache import parsing_cache
from config import settings


class AdvancedHybridParser:
    """LLM-only resume parser (Gemini enforced)"""

    def __init__(self):
        # Core
        self.gemini_parser = None

        if getattr(settings, "gemini_api_key", None):
            try:
                from services.gemini_parser import GeminiResumeParser

                self.gemini_parser = GeminiResumeParser()
                logger.success(f"✨ Gemini resume parser enabled (Model: {self.gemini_parser.model_name})")
            except Exception as e:
                logger.warning(f"⚠️ Gemini parser not available: {e}")

        # Regex ONLY for validation
        self.regex_helper = ImprovedResumeParser()

        # Other parsers
        self.excel_parser = ExcelResumeParser()
        self.ocr_parser = OCRResumeParser()

        # Utilities
        self.preprocessor = TextPreprocessor()
        self.indian_extractor = IndianPatternExtractor()
        self.cache = parsing_cache

        # Capability logging
        if not self.gemini_parser:
            raise RuntimeError("❌ Gemini LLM REQUIRED but not available")

        logger.success("🤖 Hybrid parser initialized in LLM-ONLY MODE (Gemini)")

    # ------------------------------------------------------------------
    # MODEL LOADING
    # ------------------------------------------------------------------

    async def load_models(self):
        """Load spaCy helpers only (NO parsing fallback)"""
        await self.regex_helper.load_models()
        return {
            "llm": True,
            "regex_parsing": False,
            "gliner": False,
        }

    # ------------------------------------------------------------------
    # MAIN ENTRY
    # ------------------------------------------------------------------

    async def parse_file(self, file_path: str, filename: str) -> Dict[str, Any]:

        file_ext = Path(filename).suffix.lower()

        # Cache
        cache_key = f"{file_path}:{filename}"
        cached = self.cache.get(cache_key)
        if cached:
            logger.info("⚡ Returning cached LLM result")
            return cached

        try:
            # Excel
            if file_ext in [".xls", ".xlsx"]:
                logger.info("📊 Routing to Excel parser")
                result = await self.excel_parser.parse_file(file_path, filename)
                self.cache.set(cache_key, result)
                return result

            # Images (OCR → LLM)
            if file_ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
                if not self.ocr_parser.ocr_enabled:
                    raise RuntimeError("OCR requested but Tesseract not installed")

                logger.info("🖼️ OCR → LLM pipeline")
                ocr_result = await self.ocr_parser.parse_file(file_path, filename)
                raw_text = (ocr_result.get("raw_text") or "").strip()

                if not raw_text:
                    raise RuntimeError("OCR produced empty text")

                parsed = await self.gemini_parser.parse_resume(raw_text, filename)
                parsed["extraction_method"] = "ocr+gemini"
                parsed = self._validate_and_enhance(parsed, raw_text)

                self.cache.set(cache_key, parsed)
                return parsed

            # PDF / DOCX / DOC → LLM ONLY
            if file_ext in [".pdf", ".doc", ".docx"]:
                if file_ext == ".pdf":
                    raw_text = await self.regex_helper._extract_from_pdf(file_path)
                elif file_ext == ".docx":
                    raw_text = await self.regex_helper._extract_from_docx(file_path)
                else:
                    raw_text = await self.regex_helper._extract_from_doc(file_path)

                raw_text = self.preprocessor.clean_text(raw_text)

                if not raw_text:
                    raise RuntimeError("Text extraction empty")

                logger.info(f"✨ Parsing via Gemini ({self.gemini_parser.model_name})")
                parsed = await self.gemini_parser.parse_resume(raw_text, filename)
                parsed["extraction_method"] = "gemini"
                parsed = self._validate_and_enhance(parsed, raw_text)

                logger.success("✅ LLM parsing successful")
                self.cache.set(cache_key, parsed)
                return parsed

            raise ValueError(f"Unsupported file type: {file_ext}")

        except Exception as e:
            logger.error(f"❌ LLM parsing failed for {filename}: {e}")
            raise

    # ------------------------------------------------------------------
    # VALIDATION + ENHANCEMENT (SAFE REGEX ONLY)
    # ------------------------------------------------------------------

    def _validate_and_enhance(self, llm_data: Dict[str, Any], raw_text: str) -> Dict[str, Any]:

        # Email safety
        email = llm_data.get("email")
        if not email or "@" not in email:
            llm_data["email"] = self.regex_helper._extract_email(raw_text)

        # Phone safety
        phone = llm_data.get("phone")
        if phone:
            phone = str(phone).replace(" ", "").replace("-", "")
            if not phone.isdigit() or len(phone) != 10:
                llm_data["phone"] = self.regex_helper._extract_phone(raw_text)

        # Gender heuristic
        if not llm_data.get("gender"):
            name = llm_data.get("full_name")
            if name:
                llm_data["gender"] = self.regex_helper._detect_gender(name, raw_text)

        # Normalize list fields
        for field in [
            "primary_skills",
            "secondary_skills",
            "experience",
            "projects",
            "education",
        ]:
            if not isinstance(llm_data.get(field), list):
                llm_data[field] = []

        # Legacy skills
        llm_data["skills"] = (
            llm_data.get("primary_skills", [])
            + llm_data.get("secondary_skills", [])
        )

        # Indian enhancements
        try:
            llm_data.update(self.indian_extractor.extract(raw_text))
        except Exception:
            pass

        return llm_data
