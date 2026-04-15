import re
import unicodedata
from typing import Dict, Any, List


class ResumeTextCleaner:
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

        # Remove bullet points and other common symbols from PDFs/DOCX parsing
        self._bullet_symbol_re = re.compile(r"[•●▪■□►▸◦\-_=*]+")

        # Remove repeated words/sequences (e.g. "python python python")
        self._repeat_word_re = re.compile(r"(\b\w+\b)(?:\s+\1\b)+", re.I)

        self._page_number_res = [
            re.compile(r"^\s*page\s*\d+\s*(of\s*\d+)?\s*$", re.I),
            re.compile(r"^\s*\d+\s*/\s*\d+\s*$"),
            re.compile(r"^\s*\d+\s*$"),
        ]

        self._header_footer_noise_res = [
            re.compile(r"confidential|private|internal use only", re.I),
            re.compile(r"references available upon request", re.I),
            re.compile(r"curriculum vitae|\bresume\b|\bcv\b", re.I),
            re.compile(r"©\s*\d{4}", re.I),
        ]

        self._noise_phrases = [
            "page",
            "curriculum vitae",
            "resume",
            "cv",
            "signature",
            "declaration",
            "i hereby declare",
            "references available",
        ]

    def clean_parsed_resume(self, parsed: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = dict(parsed or {})

        raw_text = cleaned.get("raw_text")
        if isinstance(raw_text, str) and raw_text.strip():
            try:
                structured_text, embedding_text = self.clean_text(raw_text)
                cleaned["raw_text"] = structured_text
                if isinstance(embedding_text, str) and embedding_text.strip():
                    cleaned["embedding_text"] = embedding_text
            except Exception:
                cleaned["raw_text"] = raw_text

        skills = cleaned.get("skills")
        if isinstance(skills, list):
            cleaned["skills"] = self.deduplicate_skills(skills)

        primary_skills = cleaned.get("primary_skills")
        if isinstance(primary_skills, list):
            cleaned["primary_skills"] = self.deduplicate_skills(primary_skills)

        # Add split texts used for aligned matching (skills vs experience)
        try:
            cleaned["resume_skills_text"] = self.build_resume_skills_text(cleaned)
            cleaned["resume_experience_text"] = self.build_resume_experience_text(cleaned)
        except Exception:
            pass

        return cleaned

    def build_resume_skills_text(self, parsed: Dict[str, Any]) -> str:
        data = parsed or {}
        skills: List[str] = []
        for k in ["primary_skills", "secondary_skills", "skills"]:
            v = data.get(k)
            if isinstance(v, list):
                skills.extend([str(x).strip() for x in v if str(x).strip()])
        skills = self.deduplicate_skills(skills)
        return ", ".join(skills).strip()

    def build_resume_experience_text(self, parsed: Dict[str, Any]) -> str:
        data = parsed or {}
        parts: List[str] = []
        exp_list = data.get("experience")
        if isinstance(exp_list, list):
            for exp in exp_list[:12]:
                if not isinstance(exp, dict):
                    continue
                title = str(exp.get("title") or exp.get("job_title") or exp.get("role") or "").strip()
                company = str(exp.get("company") or exp.get("employer") or "").strip()
                desc = str(exp.get("description") or "").strip()
                bullets = exp.get("responsibilities") or exp.get("highlights")
                if isinstance(bullets, list):
                    btxt = " ".join([str(b).strip() for b in bullets if str(b).strip()])
                    if btxt:
                        desc = (desc + "\n" + btxt).strip() if desc else btxt
                block = "\n".join([x for x in [f"{title} - {company}".strip(" -"), desc] if x]).strip()
                if block:
                    parts.append(block)

        proj_list = data.get("projects")
        if isinstance(proj_list, list):
            for proj in proj_list[:8]:
                if not isinstance(proj, dict):
                    continue
                ptitle = str(proj.get("project_title") or proj.get("title") or "").strip()
                pdesc = str(proj.get("description") or "").strip()
                block = "\n".join([x for x in [ptitle, pdesc] if x]).strip()
                if block:
                    parts.append(block)

        return "\n\n".join(parts).strip()

    def clean_text(self, text: str):
        original = text
        try:
            text = unicodedata.normalize("NFKD", text)
            text = self._remove_repeated_header_footer(text)
            text = self._remove_page_numbers(text)

            text = self._url_re.sub(" ", text)
            text = self._email_re.sub(" ", text)
            text = self._phone_re.sub(" ", text)

            # Preserve bullets/structure for structured_text (do not destroy line semantics)
            text = self._non_year_number_re.sub(" ", text)

            if self.lowercase:
                text = text.lower()

            if self.remove_non_ascii:
                text = re.sub(r"[^\x00-\x7F]+", " ", text)

            structured_text = self._normalize_whitespace(text).strip()
            structured_text = self._repeat_word_re.sub(r"\1", structured_text)

            for noise in self._noise_phrases:
                structured_text = re.sub(re.escape(noise), " ", structured_text, flags=re.I)

            structured_text = self._normalize_whitespace(structured_text).strip()

            embedding_text = structured_text
            if self.flatten_whitespace:
                try:
                    embedding_text = self._bullet_symbol_re.sub(" ", embedding_text)
                    embedding_text = re.sub(r"\s+", " ", embedding_text).strip()
                except Exception:
                    embedding_text = structured_text

            return structured_text, embedding_text
        except Exception:
            return original, original

    def chunk_text(
        self,
        text: str,
        *,
        chunk_size: int = 1200,
        chunk_overlap: int = 200,
        min_chunk_size: int = 200,
    ) -> List[str]:
        if not text or chunk_size <= 0:
            return []

        if chunk_overlap < 0:
            chunk_overlap = 0
        if chunk_overlap >= chunk_size:
            chunk_overlap = max(0, chunk_size // 4)

        t = text.strip()
        if not t:
            return []

        chunks: List[str] = []
        n = len(t)
        start = 0

        while start < n:
            max_end = min(n, start + chunk_size)
            end = max_end

            if max_end < n:
                window = t[start:max_end]
                for sep in ["\n\n", "\n", ". ", " "]:
                    cut = window.rfind(sep)
                    if cut != -1 and cut >= int(chunk_size * 0.5):
                        end = start + cut + len(sep)
                        break

            chunk = t[start:end].strip()
            if chunk and (len(chunk) >= min_chunk_size or not chunks):
                chunks.append(chunk)

            if end >= n:
                break
            start = max(0, end - chunk_overlap)

        return chunks

    def deduplicate_skills(self, skills: List[str]) -> List[str]:
        seen = set()
        out: List[str] = []
        for s in skills:
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

    # ================= EMBEDDING SECTIONS (CORE ATS LOGIC) =================

    def build_embedding_sections(self, parsed: Dict[str, Any]) -> List[Dict[str, str]]:
        chunks: List[Dict[str, str]] = []
        data = parsed or {}

        embedding_source = data.get("embedding_text")
        if not isinstance(embedding_source, str) or not embedding_source.strip():
            embedding_source = data.get("raw_text")
        if not isinstance(embedding_source, str):
            embedding_source = ""

        designation = str(data.get("designation") or data.get("current_title") or "").strip()
        total_exp = data.get("total_experience") or data.get("experience_years") or ""

        # -------- SUMMARY (NO LOCATION) --------
        summary = str(
            data.get("professional_summary")
            or data.get("summary")
            or data.get("profile_summary")
            or ""
        ).strip()

        if summary:
            header = []
            if designation:
                header.append(f"role: {designation}")
            if total_exp != "" and total_exp is not None:
                header.append(f"experience: {total_exp} years")

            prefix = "\n".join(header)
            content = f"{prefix}\nsummary:\n{summary}".strip() if prefix else f"summary:\n{summary}".strip()
            chunks.append({"section": "summary", "content": content})

        # -------- SKILLS --------
        skills: List[str] = []
        for k in ["primary_skills", "secondary_skills", "skills"]:
            v = data.get(k)
            if isinstance(v, list):
                skills.extend([str(x).strip() for x in v if str(x).strip()])
        skills = self.deduplicate_skills(skills)

        if skills:
            header = []
            if designation:
                header.append(f"role: {designation}")
            if total_exp != "" and total_exp is not None:
                header.append(f"experience: {total_exp} years")

            prefix = "\n".join(header)
            skills_text = ", ".join(skills)
            content = f"{prefix}\nskills:\n{skills_text}".strip() if prefix else f"skills:\n{skills_text}".strip()
            chunks.append({"section": "skills", "content": content})

        # Dedicated aligned section: skills-only text (no summary/education/experience)
        resume_skills_text = str(data.get("resume_skills_text") or "").strip()
        if resume_skills_text:
            chunks.append({"section": "resume_skills", "content": resume_skills_text})

        if embedding_source.strip() and not summary:
            chunks.append({"section": "resume_text", "content": embedding_source.strip()})

        # -------- EXPERIENCE --------
        exp_list = data.get("experience")
        if isinstance(exp_list, list):
            for exp in exp_list[:10]:
                if not isinstance(exp, dict):
                    continue

                title = str(exp.get("title") or exp.get("job_title") or "").strip()
                company = str(exp.get("company") or exp.get("employer") or "").strip()
                start = str(exp.get("start_date") or exp.get("from") or "").strip()
                end = str(exp.get("end_date") or exp.get("to") or "").strip()
                desc = str(exp.get("description") or "").strip()

                bullets = exp.get("responsibilities") or exp.get("highlights")
                if not desc and isinstance(bullets, list):
                    desc = " ".join([str(b).strip() for b in bullets if str(b).strip()])

                if not (title or company or desc):
                    continue

                body = []
                if title or company:
                    body.append(" - ".join([x for x in [title, company] if x]))
                if start or end:
                    body.append(f"{start} to {end}".strip())
                if desc:
                    body.append(desc)

                content = "\n".join(body).strip()
                chunks.append({"section": "experience", "content": content})

        # Dedicated aligned section: experience/responsibilities-only text
        resume_experience_text = str(data.get("resume_experience_text") or "").strip()
        if resume_experience_text:
            chunks.append({"section": "resume_experience", "content": resume_experience_text})

        # -------- EDUCATION (NEW – IMPORTANT) --------
        edu_list = data.get("education")
        if isinstance(edu_list, list):
            for edu in edu_list[:10]:
                if not isinstance(edu, dict):
                    continue

                parts = []
                if edu.get("degree"):
                    parts.append(f"degree: {edu['degree']}")
                if edu.get("field"):
                    parts.append(f"field: {edu['field']}")
                if edu.get("institution"):
                    parts.append(f"institution: {edu['institution']}")
                if edu.get("year"):
                    parts.append(f"year: {edu['year']}")

                if parts:
                    content = "education: " + ", ".join(parts)
                    chunks.append({"section": "education", "content": content})

        # -------- PROJECTS --------
        proj_list = data.get("projects")
        if isinstance(proj_list, list):
            for proj in proj_list[:10]:
                if not isinstance(proj, dict):
                    continue

                ptitle = str(proj.get("project_title") or proj.get("title") or "").strip()
                pdesc = str(proj.get("description") or "").strip()

                if not (ptitle or pdesc):
                    continue

                content = "\n".join([x for x in [ptitle, pdesc] if x]).strip()
                chunks.append({"section": "projects", "content": content})

        return chunks

    # ================= HELPERS =================

    def _normalize_whitespace(self, text: str) -> str:
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[\t\f\v]+", " ", text)
        text = re.sub(r"\u00A0", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ ]{2,}", " ", text)
        lines = [ln.strip() for ln in text.split("\n")]
        return "\n".join([ln for ln in lines if ln != ""]).strip()

    def _remove_page_numbers(self, text: str) -> str:
        lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        kept: List[str] = []
        for ln in lines:
            stripped = ln.strip()
            if not stripped:
                continue
            if any(rx.match(stripped) for rx in self._page_number_res):
                continue
            kept.append(ln)
        return "\n".join(kept)

    def _remove_repeated_header_footer(self, text: str) -> str:
        raw = text.replace("\r\n", "\n").replace("\r", "\n")
        pages = re.split(r"\f|\n{4,}", raw)
        if len(pages) < 3:
            return self._strip_known_noise_lines(raw)

        candidate_counts: Dict[str, int] = {}
        page_edges: List[List[str]] = []

        for p in pages:
            lines = [ln.strip() for ln in p.split("\n") if ln.strip()]
            if not lines:
                continue
            edges = lines[:2] + lines[-2:]
            page_edges.append(edges)
            for ln in edges:
                norm = re.sub(r"\s+", " ", ln).strip()
                if len(norm) < 6 or len(norm) > 80:
                    continue
                candidate_counts[norm] = candidate_counts.get(norm, 0) + 1

        to_remove = {ln for ln, c in candidate_counts.items() if c >= 3}

        cleaned_pages: List[str] = []
        for p in pages:
            lines = [ln for ln in p.split("\n")]
            new_lines: List[str] = []
            for ln in lines:
                norm = re.sub(r"\s+", " ", ln.strip()).strip()
                if norm in to_remove:
                    continue
                if any(rx.search(norm) for rx in self._header_footer_noise_res):
                    continue
                new_lines.append(ln)
            cleaned_pages.append("\n".join(new_lines))

        return "\n\n".join(cleaned_pages)

    def _strip_known_noise_lines(self, text: str) -> str:
        lines = text.split("\n")
        out: List[str] = []
        for ln in lines:
            if any(rx.search(ln) for rx in self._header_footer_noise_res):
                continue
            out.append(ln)
        return "\n".join(out)
