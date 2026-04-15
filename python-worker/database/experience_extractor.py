import re
from typing import Any, Dict, List


def extract_experience(resume_text: str) -> List[Dict[str, Any]]:
    text = (resume_text or "").strip()
    if not text:
        return []

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    exp_start = None
    for i, ln in enumerate(lines):
        if re.search(r"\b(experience|work experience|employment)\b", ln, re.I):
            exp_start = i
            break

    scan = lines[exp_start:] if exp_start is not None else lines
    scan = scan[:250]

    year_re = re.compile(r"\b(19\d{2}|20\d{2})\b")
    end_current_re = re.compile(r"\b(present|current|till date|till now)\b", re.I)

    results: List[Dict[str, Any]] = []
    for ln in scan:
        years = [int(y) for y in year_re.findall(ln)[:2]]
        if not years and not end_current_re.search(ln):
            continue

        start_year = years[0] if years else None
        end_year = years[1] if len(years) > 1 else None
        if end_current_re.search(ln):
            end_year = None

        parts = re.split(r"\s*(?:\||@|\-|–|—)\s*", ln)
        parts = [p.strip() for p in parts if p.strip()]

        role = ""
        company = ""
        if len(parts) >= 2:
            role = parts[0]
            company = parts[1]
        elif len(parts) == 1:
            role = parts[0]

        role = year_re.sub("", role).strip()
        company = year_re.sub("", company).strip()
        company = re.sub(r"\b(present|current|till date|till now)\b", "", company, flags=re.I).strip()
        role = re.sub(r"\b(present|current|till date|till now)\b", "", role, flags=re.I).strip()

        if not (role or company):
            continue

        results.append(
            {
                "company": company,
                "role": role,
                "start_year": start_year,
                "end_year": end_year,
            }
        )

        if len(results) >= 10:
            break

    seen = set()
    deduped: List[Dict[str, Any]] = []
    for r in results:
        key = (
            (r.get("company") or "").lower(),
            (r.get("role") or "").lower(),
            r.get("start_year"),
            r.get("end_year"),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    return deduped
