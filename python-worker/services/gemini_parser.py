import json
from typing import Any, Dict

import google.generativeai as genai
from loguru import logger

from config import settings


class GeminiResumeParser:
    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.model_name = settings.gemini_model

        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self._normalize_model_name(self.model_name))

    async def parse_resume(self, raw_text: str, filename: str) -> Dict[str, Any]:
        prompt = self._create_extraction_prompt(raw_text, filename)

        try:
            # Request strict JSON when possible. Also do a retry with more tokens
            # if the response looks truncated.
            text = await self._generate_text(prompt, max_output_tokens=4096)
            json_text = self._extract_json(text)

            try:
                parsed = json.loads(json_text)
            except json.JSONDecodeError:
                # Retry once with more tokens (common truncation issue)
                text = await self._generate_text(prompt, max_output_tokens=8192)
                json_text = self._extract_json(text)
                parsed = json.loads(json_text)

            if not isinstance(parsed, dict):
                raise RuntimeError("Gemini returned non-object JSON")

            parsed.update(
                {
                    "raw_text": raw_text[:10000],
                    "filename": filename,
                    "parser_type": "gemini",
                    "model_used": self.model_name,
                }
            )

            return parsed

        except Exception as e:
            msg = str(e)
            if "models/" in msg and "not found" in msg.lower():
                try:
                    models = [m.name for m in genai.list_models() if "generateContent" in getattr(m, "supported_generation_methods", [])]
                except Exception:
                    models = []
                hint = "" if not models else f" Available generateContent models: {models[:12]}"
                logger.error(f"❌ Gemini model not found: {self.model_name}.{hint}")
            else:
                logger.error(f"❌ Gemini parsing failed: {e}")
            raise

    async def _generate_text(self, prompt: str, max_output_tokens: int) -> str:
        resp = self.model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.1,
                "top_p": 0.9,
                "max_output_tokens": max_output_tokens,
                "response_mime_type": "application/json",
            },
        )

        # Prefer SDK convenience attribute
        text = (getattr(resp, "text", None) or "").strip()

        # Fallback: stitch parts if .text is missing
        if not text and getattr(resp, "candidates", None):
            parts = []
            for c in resp.candidates:
                content = getattr(c, "content", None)
                if not content:
                    continue
                for p in getattr(content, "parts", []) or []:
                    t = getattr(p, "text", None)
                    if t:
                        parts.append(t)
            text = ("".join(parts) or "").strip()

        if not text:
            raise RuntimeError("Gemini returned empty response")
        return text

    def _normalize_model_name(self, name: str) -> str:
        n = (name or "").strip()
        if not n:
            return "gemini-1.0-pro"
        if n.startswith("models/"):
            return n
        return n

    def _extract_json(self, s: str) -> str:
        # Remove markdown code blocks
        if "```" in s:
            s = s.replace("```json", "").replace("```", "").strip()

        # Try to find JSON object
        start = s.find("{")
        if start == -1:
            logger.error(f"❌ Gemini response (first 500 chars): {s[:500]}")
            raise RuntimeError("No JSON object found in Gemini output")

        # If the closing brace is missing (truncated), take the tail and attempt repair.
        last_close = s.rfind("}")
        json_text = s[start:] if last_close == -1 else s[start : last_close + 1]

        # Parse as-is if possible
        try:
            json.loads(json_text)
            return json_text
        except json.JSONDecodeError:
            pass

        # Attempt a safe repair for truncated outputs by balancing braces/brackets.
        # This commonly happens when max_output_tokens is reached mid-response.
        trimmed = json_text.rstrip()
        
        # 1. Handle unclosed strings (common in truncation)
        if trimmed.count('"') % 2 != 0:
            trimmed += '"'

        opens_curly = trimmed.count("{")
        closes_curly = trimmed.count("}")
        opens_sq = trimmed.count("[")
        closes_sq = trimmed.count("]")

        repaired = trimmed
        # Close arrays first, then objects
        if closes_sq < opens_sq:
            repaired += "]" * (opens_sq - closes_sq)
        if closes_curly < opens_curly:
            repaired += "}" * (opens_curly - closes_curly)

        try:
            json.loads(repaired)
            return repaired
        except json.JSONDecodeError:
            # 2. More aggressive fallback: trim to last comma and re-balance
            last_comma = repaired.rfind(",")
            if last_comma != -1:
                trimmed_fallback = repaired[:last_comma].rstrip()
                # Re-check quotes on the fallback
                if trimmed_fallback.count('"') % 2 != 0:
                    trimmed_fallback += '"'
                
                opens_curly = trimmed_fallback.count("{")
                closes_curly = trimmed_fallback.count("}")
                opens_sq = trimmed_fallback.count("[")
                closes_sq = trimmed_fallback.count("]")
                
                repaired_fallback = trimmed_fallback
                if closes_sq < opens_sq:
                    repaired_fallback += "]" * (opens_sq - closes_sq)
                if closes_curly < opens_curly:
                    repaired_fallback += "}" * (opens_curly - closes_curly)
                
                try:
                    json.loads(repaired_fallback)
                    return repaired_fallback
                except:
                    pass

            logger.error(f"❌ JSON parse error after repair attempt")
            logger.error(f"❌ Gemini response (first 500 chars): {s[:500]}")
            raise RuntimeError("Invalid JSON from Gemini")

    def _create_extraction_prompt(self, raw_text: str, filename: str) -> str:
        return f"""
You are a resume parser. Extract structured JSON from the resume text.

FILENAME: {filename}

RESUME TEXT:
{raw_text[:12000]}

IMPORTANT: Return ONLY a valid JSON object. No markdown, no commentary, no extra text.

JSON schema:
{{
  "full_name": "",
  "email": "",
  "phone": "",
  "location": "",
  "designation": "",
  "total_experience": 0,
  "country": "India",
  "city": "",
  "gender": "",
  "primary_skills": [],
  "secondary_skills": [],
  "experience": [{{"company": "", "role": "", "start_year": 0, "end_year": 0}}],
  "education": [{{"degree": "", "institute": "", "passing_year": 0}}],
  "certifications": [],
  "languages": [],
  "portfolio_url": null,
  "linkedin_url": null,
  "github_url": null
}}

Rules:
- Email is mandatory. If missing, set email to empty string.
- Phone should be 10 digits if possible.
- primary_skills: top 5 only.
- Return ONLY the JSON object, nothing else.
- if pan card number was there that one should also be filled
""".strip()
