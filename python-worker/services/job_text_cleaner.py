import re
import unicodedata
from typing import Any, Dict, List


class JobTextCleaner:
    def __init__(
        self,
        *,
        lowercase: bool = True,
        remove_non_ascii: bool = True,
        flatten_whitespace: bool = True,
    ):
        self.lowercase = lowercase
        self.remove_non_ascii = remove_non_ascii
        self.flatten_whitespace = flatten_whitespace

        self._url_re = re.compile(r"http\S+|www\.\S+", re.I)
        self._email_re = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
        self._phone_re = re.compile(
            r"(?:\+?\d{1,3}[-\s.]*)?(?:\(?\d{2,4}\)?[-\s.]*)?(?:\d[-\s.]*){8,12}\d"
        )

        # Remove numbers that are not years (keep 1900-2099)
        self._non_year_number_re = re.compile(r"\b(?!(?:19|20)\d{2})\d+\b")

        self._bullet_symbol_re = re.compile(r"[•●▪■□►▸◦\-_=*]+")
        self._repeat_word_re = re.compile(r"(\b\w+\b)(?:\s+\1\b)+", re.I)

        # Explicitly remove these from embedding text
        self._salary_re = re.compile(
            r"\b(?:ctc|salary|lpa|lakhs?|per\s+annum|pa\b|p\.?a\.?|usd|inr|rs\.?|₹)\b",
            re.I,
        )
        self._benefits_re = re.compile(
            r"\b(?:benefits?|perks?|insurance|pf\b|gratuity|bonus|incentives?)\b",
            re.I,
        )

    def clean_text(self, text: str) -> str:
        if not isinstance(text, str):
            return ""

        text = unicodedata.normalize("NFKD", text)

        text = self._url_re.sub(" ", text)
        text = self._email_re.sub(" ", text)
        text = self._phone_re.sub(" ", text)

        text = self._bullet_symbol_re.sub(" ", text)
        text = self._salary_re.sub(" ", text)
        text = self._benefits_re.sub(" ", text)

        text = self._non_year_number_re.sub(" ", text)

        if self.lowercase:
            text = text.lower()

        if self.remove_non_ascii:
            text = re.sub(r"[^\x00-\x7F]+", " ", text)

        text = self._normalize_whitespace(text)
        if self.flatten_whitespace:
            text = re.sub(r"\s+", " ", text).strip()

        text = self._repeat_word_re.sub(r"\1", text)

        text = self._normalize_whitespace(text)
        if self.flatten_whitespace:
            text = re.sub(r"\s+", " ", text).strip()

        return text.strip()

    def deduplicate_skills(self, skills: List[str]) -> List[str]:
        seen = set()
        out: List[str] = []
        for s in skills or []:
            if not s:
                continue
            val = str(s).strip()
            if not val:
                continue
            key = val.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(val.lower() if self.lowercase else val)
        return out

    def _normalize_whitespace(self, text: str) -> str:
        if not text:
            return ""
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[\t\f\v]+", " ", text)
        text = re.sub(r"\u00A0", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ ]{2,}", " ", text)
        lines = [ln.strip() for ln in text.split("\n")]
        return "\n".join([ln for ln in lines if ln != ""]).strip()

    # ================= EMBEDDING SECTIONS (ALIGN WITH RESUME) =================

    def build_job_embedding_sections(self, job: Dict[str, Any]) -> List[Dict[str, str]]:
        """
        Build semantically-aligned job embedding sections.

        Strict rules:
        - DO NOT include location
        - DO NOT include salary / company name / benefits

        Output format:
            [{"section": "...", "content": "..."}]
        """
        data = job or {}
        chunks: List[Dict[str, str]] = []

        role = str(
            data.get("title")
            or data.get("job_title")
            or data.get("role")
            or data.get("designation")
            or ""
        ).strip()

        # Experience can come in many shapes
        exp_min = data.get("min_experience") or data.get("experience_min") or data.get("min_years")
        exp_max = data.get("max_experience") or data.get("experience_max") or data.get("max_years")
        exp_raw = data.get("experience") or data.get("required_experience")

        exp_line = ""
        try:
            if exp_min is not None or exp_max is not None:
                if exp_min is None:
                    exp_line = f"experience: up to {exp_max} years"
                elif exp_max is None:
                    exp_line = f"experience: {exp_min}+ years"
                else:
                    exp_line = f"experience: {exp_min}-{exp_max} years"
            elif exp_raw is not None and str(exp_raw).strip():
                exp_line = f"experience: {str(exp_raw).strip()}"
        except Exception:
            exp_line = ""

        header: List[str] = []
        if role:
            header.append(f"role: {self.clean_text(role)}")
        if exp_line:
            header.append(self.clean_text(exp_line))
        prefix = "\n".join([h for h in header if h]).strip()

        # ---- SKILLS ----
        skills: List[str] = []
        for k in [
            "required_skills",
            "skills",
            "key_skills",
            "must_have_skills",
            "primary_skills",
        ]:
            v = data.get(k)
            if isinstance(v, list):
                skills.extend([str(x).strip() for x in v if str(x).strip()])
            elif isinstance(v, str) and v.strip():
                skills.extend([s.strip() for s in v.split(",") if s.strip()])

        skills = self.deduplicate_skills(skills)[:10]
        if skills:
            content = "\n".join(
                [
                    prefix,
                    "skills:",
                    ", ".join([self.clean_text(s) for s in skills if s]),
                ]
            ).strip()
            chunks.append({"section": "skills", "content": content})

        # ---- EDUCATION ----
        education_raw = (
            data.get("education")
            or data.get("education_requirement")
            or data.get("qualification")
            or data.get("qualifications")
        )
        if isinstance(education_raw, list):
            edu_items = [self.clean_text(str(x)) for x in education_raw if str(x).strip()][:10]
            edu_text = ", ".join([e for e in edu_items if e]).strip()
        else:
            edu_text = self.clean_text(str(education_raw)) if education_raw is not None else ""

        if edu_text:
            content = "\n".join([prefix, "education:", edu_text]).strip() if prefix else f"education:\n{edu_text}".strip()
            chunks.append({"section": "education", "content": content})

        # ---- RESPONSIBILITIES / DESCRIPTION ----
        desc_raw = (
            data.get("job_description")
            or data.get("description")
            or data.get("responsibilities")
            or data.get("role_responsibilities")
            or ""
        )
        req_raw = data.get("requirements") or data.get("required_skills") or ""

        responsibilities: List[str] = []
        combined = ""
        if isinstance(desc_raw, list):
            combined = "\n".join([str(x) for x in desc_raw if str(x).strip()])
        elif isinstance(desc_raw, str):
            combined = desc_raw

        if isinstance(req_raw, list):
            combined = (combined + "\n" + "\n".join([str(x) for x in req_raw if str(x).strip()])).strip()
        elif isinstance(req_raw, str) and req_raw.strip():
            combined = (combined + "\n" + req_raw).strip()

        if isinstance(combined, str) and combined.strip():
            # Try splitting into bullets/lines
            raw = combined.replace("\r\n", "\n").replace("\r", "\n")
            parts = [p.strip() for p in re.split(r"\n+|•|\u2022|\*|-\s+", raw) if p.strip()]
            if len(parts) >= 2:
                responsibilities = [self.clean_text(p) for p in parts]
            else:
                responsibilities = [self.clean_text(combined)]

        responsibilities = [r for r in responsibilities if r]
        if responsibilities:
            responsibilities = responsibilities[:10]
            content = "\n".join([prefix, "responsibilities:"] + responsibilities).strip()
            chunks.append({"section": "responsibilities", "content": content})

        return chunks
