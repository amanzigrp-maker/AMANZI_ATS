"""
ATS AI Worker Service
--------------------
Python is a PURE WORKER:
- NEVER uploads files
- NEVER renames files
- NEVER creates resume records
- ONLY parses files using resume_id + file_path from DB
"""

import sys
import asyncio
from pathlib import Path
from typing import Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from loguru import logger

from config import settings
from database.db import Database
from services.advanced_hybrid_parser import AdvancedHybridParser
from services.embedding_factory import get_embedding_service
from services.enhanced_matching_service import EnhancedMatchingService
from services.duplicate_checker import DuplicateChecker
from services.resume_text_cleaner import ResumeTextCleaner
from services.job_text_cleaner import JobTextCleaner
from services.ocr_parser import OCRResumeParser


# ---------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
           "<level>{level}</level> | "
           "<cyan>{name}:{function}</cyan> - "
           "<level>{message}</level>",
    level=settings.log_level,
    backtrace=False,
    diagnose=False,
)

# ---------------------------------------------------------------------
# Service Status Tracker
# ---------------------------------------------------------------------
SERVICE_STATUS = {
    "db": False,
    "ocr": False,
    "nlp": False,
    "embeddings": False,
    "matching": False,
}

STARTUP_STATE = {
    "phase": "booting",
    "ready": False,
    "errors": [],
}

# ---------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------
db = Database()
parser_service = AdvancedHybridParser()
embedding_service = get_embedding_service()  # Uses factory to get configured provider
enhanced_matcher = EnhancedMatchingService(db, embedding_service)
duplicate_checker = DuplicateChecker(db)

resume_text_cleaner = ResumeTextCleaner(
    lowercase=True,
    remove_non_ascii=True,
    flatten_whitespace=True,
)

job_text_cleaner = JobTextCleaner(
    lowercase=True,
    remove_non_ascii=True,
    flatten_whitespace=True,
)

ocr_service = OCRResumeParser()


async def warmup_services() -> None:
    STARTUP_STATE["phase"] = "warming"
    STARTUP_STATE["ready"] = False
    STARTUP_STATE["errors"] = []

    try:
        SERVICE_STATUS["ocr"] = ocr_service.ocr_enabled
        if ocr_service.ocr_enabled:
            logger.success("OCR: READY")
        else:
            logger.warning("OCR: DISABLED (Tesseract not installed)")
    except Exception as e:
        STARTUP_STATE["errors"].append(f"ocr: {e}")
        logger.error(f"OCR init failed: {e}")

    load_tasks = {
        "nlp": asyncio.create_task(parser_service.load_models()),
        "embeddings": asyncio.create_task(embedding_service.load_models()),
    }

    results = await asyncio.gather(*load_tasks.values(), return_exceptions=True)

    for service_name, result in zip(load_tasks.keys(), results):
        if isinstance(result, Exception):
            STARTUP_STATE["errors"].append(f"{service_name}: {result}")
            logger.error(f"{service_name.upper()} load failed: {result}")
            continue

        if service_name == "nlp":
            SERVICE_STATUS["nlp"] = True
            logger.success("NLP Models loaded")
        elif service_name == "embeddings":
            SERVICE_STATUS["embeddings"] = embedding_service.is_loaded()
            if SERVICE_STATUS["embeddings"]:
                logger.success("Embedding model loaded")
            else:
                logger.warning("Embedding model not loaded")

    try:
        await enhanced_matcher.load_models()
        SERVICE_STATUS["matching"] = True
        logger.success("Enhanced Matching Service loaded")
    except Exception as e:
        STARTUP_STATE["errors"].append(f"matching: {e}")
        logger.error(f"Enhanced Matcher load failed: {e}")

    STARTUP_STATE["ready"] = (
        SERVICE_STATUS["db"]
        and SERVICE_STATUS["nlp"]
        and SERVICE_STATUS["embeddings"]
        and SERVICE_STATUS["matching"]
    )
    STARTUP_STATE["phase"] = "ready" if STARTUP_STATE["ready"] else "degraded"

    logger.info("===================================")
    logger.info("ATS WORKER STATUS SUMMARY")
    logger.info(f"DB         : {'READY' if SERVICE_STATUS['db'] else 'DOWN'}")
    logger.info(f"OCR        : {'READY' if SERVICE_STATUS['ocr'] else 'DISABLED'}")
    logger.info(f"NLP        : {'READY' if SERVICE_STATUS['nlp'] else 'DOWN'}")
    logger.info(f"EMBEDDINGS : {'READY' if SERVICE_STATUS['embeddings'] else 'DOWN'}")
    logger.info(f"MATCHING   : {'READY' if SERVICE_STATUS['matching'] else 'DOWN'}")
    logger.info(f"WORKER     : {STARTUP_STATE['phase'].upper()}")
    logger.info("===================================")


# ---------------------------------------------------------------------
# FastAPI Lifespan (Startup / Shutdown)
# ---------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):

    # ---------------- STARTUP ----------------
    logger.info("🚀 Starting ATS AI Worker...")

    # Database
    try:
        await db.connect()
        SERVICE_STATUS["db"] = True
        logger.success("✅ Database connected")
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")

    # OCR
    try:
        SERVICE_STATUS["ocr"] = ocr_service.ocr_enabled
        if ocr_service.ocr_enabled:
            logger.success("✅ OCR: READY")
        else:
            logger.warning("⚠️ OCR: DISABLED (Tesseract not installed)")
    except Exception as e:
        logger.error(f"❌ OCR init failed: {e}")

    # NLP
    try:
        await parser_service.load_models()
        SERVICE_STATUS["nlp"] = True
        logger.success("✅ NLP Models loaded")
    except Exception as e:
        logger.error(f"❌ NLP model load failed: {e}")

    # Embeddings
    try:
        await embedding_service.load_models()
        SERVICE_STATUS["embeddings"] = embedding_service.is_loaded()
        if SERVICE_STATUS["embeddings"]:
            logger.success("✅ Embedding model loaded")
        else:
            logger.warning("⚠️ Embedding model not loaded")
    except Exception as e:
        logger.error(f"❌ Embedding model load failed: {e}")

    # Enhanced Matcher
    try:
        await enhanced_matcher.load_models()
        SERVICE_STATUS["matching"] = True
        logger.success("✅ Enhanced Matching Service loaded")
    except Exception as e:
        logger.error(f"❌ Enhanced Matcher load failed: {e}")

    # SUMMARY
    logger.info("===================================")
    logger.info("📊 ATS WORKER STATUS SUMMARY")
    logger.info(f"DB         : {'READY' if SERVICE_STATUS['db'] else 'DOWN'}")
    logger.info(f"OCR        : {'READY' if SERVICE_STATUS['ocr'] else 'DISABLED'}")
    logger.info(f"NLP        : {'READY' if SERVICE_STATUS['nlp'] else 'DOWN'}")
    logger.info(f"EMBEDDINGS : {'READY' if SERVICE_STATUS['embeddings'] else 'DOWN'}")
    logger.info(f"MATCHING   : {'READY' if SERVICE_STATUS['matching'] else 'DOWN'}")
    logger.info("===================================")

    yield

    # ---------------- SHUTDOWN ----------------
    try:
        await db.disconnect()
        logger.info("🛑 Database disconnected")
    except Exception:
        pass

    logger.info("🛑 ATS AI Worker stopped")


# ---------------------------------------------------------------------
# Alternate FastAPI Lifespan (non-blocking warmup)
# ---------------------------------------------------------------------
@asynccontextmanager
async def fast_lifespan(app: FastAPI):
    logger.info("Starting ATS AI Worker...")

    try:
        await db.connect()
        SERVICE_STATUS["db"] = True
        logger.success("Database connected")
    except Exception as e:
        STARTUP_STATE["phase"] = "degraded"
        STARTUP_STATE["errors"].append(f"db: {e}")
        logger.error(f"Database connection failed: {e}")

    app.state.warmup_task = asyncio.create_task(warmup_services())

    yield

    warmup_task = getattr(app.state, "warmup_task", None)
    if warmup_task and not warmup_task.done():
        warmup_task.cancel()

    try:
        await db.disconnect()
        logger.info("Database disconnected")
    except Exception:
        pass

    logger.info("ATS AI Worker stopped")


# ---------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------
app = FastAPI(
    title="ATS AI Worker",
    description="Pure parsing + embeddings worker",
    version="3.0.0",
    lifespan=fast_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    logger.error(f"❌ HTTPException {exc.status_code}: {exc.detail} | Path: {request.url.path}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "success": False}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception(f"🔥 Unhandled Error: {exc} | Path: {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "success": False}
    )


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
def normalize_field(value):
    if isinstance(value, dict):
        return value.get("value") or next(iter(value.values()), "")
    if value is None:
        return ""
    return str(value)


def normalize_parsed_data(parsed: Dict[str, Any]) -> Dict[str, Any]:
    for key in [
        "email",
        "phone",
        "full_name",
        "linkedin_url",
        "github_url",
        "portfolio_url",
        "location",
    ]:
        parsed[key] = normalize_field(parsed.get(key))
    return parsed


def normalize_windows_path(resume_id: int, file_path: str) -> Path:
    if not file_path:
        raise HTTPException(422, f"resume_id={resume_id}: file_path is empty or NULL")

    try:
        raw = str(file_path).replace("\\", "/")
        path = Path(raw).resolve(strict=False)
    except Exception as e:
        raise HTTPException(422, f"resume_id={resume_id}: invalid file_path '{file_path}' ({e})")

    if not path.exists():
        return None

    if not path.is_file():
        raise HTTPException(422, f"resume_id={resume_id}: path is not a file: {path}")

    return path


def build_assessment_question_embedding_text(question: Dict[str, Any]) -> str:
    options = question.get("options") or {}
    ordered_options = []
    for key in ["A", "B", "C", "D"]:
        value = ""
        if isinstance(options, dict):
            value = str(options.get(key) or "").strip()
        if value:
            ordered_options.append(f"{key}. {value}")

    parts = [
        f"Topic: {str(question.get('topic') or 'General').strip()}",
        f"Difficulty: {str(question.get('difficulty') or 'medium').strip()}",
        f"Question: {str(question.get('question_text') or '').strip()}",
    ]

    if ordered_options:
        parts.append("Options: " + " | ".join(ordered_options))

    explanation = str(question.get("explanation") or "").strip()
    if explanation:
        parts.append(f"Explanation: {explanation}")

    return "\n".join(part for part in parts if part).strip()


# ---------------------------------------------------------------------
# Background Task
# ---------------------------------------------------------------------
async def process_resume_task(resume_id: int, file_path: str, filename: str, is_bulk: bool = False):
    try:
        logger.info(f"🔄 Background processing resume_id={resume_id}")

        parsed = await parser_service.parse_file(file_path, filename)
        parsed = normalize_parsed_data(parsed)
        parsed = resume_text_cleaner.clean_parsed_resume(parsed)

        sections = resume_text_cleaner.build_embedding_sections(parsed)

        if sections and SERVICE_STATUS["embeddings"]:
            await embedding_service.batch_encode([s.get("content", "") for s in sections])

        if is_bulk:
            await db.store_parsed_resume_data(resume_id, parsed)
            
        await db.update_resume_status(resume_id, "completed")

        logger.success(f"✅ Background processing complete for resume_id={resume_id}")

    except Exception as e:
        logger.exception(f"❌ Background processing failed for resume_id={resume_id}")
        await db.update_resume_status(resume_id, "failed", str(e))


# ---------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------
@app.get("/health")
async def health():
    return {
        "status": "ok" if SERVICE_STATUS["db"] else "degraded",
        "worker": {
            "phase": STARTUP_STATE["phase"],
            "ready": STARTUP_STATE["ready"],
            "errors": STARTUP_STATE["errors"],
        },
        "services": {
            "database": "ready" if SERVICE_STATUS["db"] else "down",
            "ocr": "ready" if SERVICE_STATUS["ocr"] else "disabled",
            "nlp": "ready" if SERVICE_STATUS["nlp"] else "down",
            "embeddings": "ready" if SERVICE_STATUS["embeddings"] else "down",
            "matching": "ready" if SERVICE_STATUS["matching"] else "down",
        },
    }


# ---------------------------------------------------------------------
# Gemini Ranking API
# ---------------------------------------------------------------------
@app.post("/gemini-rank")
async def gemini_rank_candidates(request: Request):
    """Use Gemini API to intelligently rank candidates for a job"""
    try:
        body = await request.json()
        job_data = body.get("job_data", {})
        candidates = body.get("candidates", [])
        top_k = body.get("top_k", 10)
        
        if not job_data or not candidates:
            raise HTTPException(400, "job_data and candidates are required")
        
        # Check if Gemini API key is available
        if not settings.gemini_api_key:
            logger.warning("Gemini API key not set, skipping Gemini ranking")
            return {
                "success": False,
                "message": "Gemini API key not configured",
                "ranked_candidates": candidates  # Return original order
            }
        
        # Initialize Gemini recommendation service
        from services.gemini_recommendation_service import GeminiRecommendationService
        
        gemini_service = GeminiRecommendationService()
        
        # Rank candidates using Gemini
        ranked_candidates = await gemini_service.rank_candidates(
            job_data=job_data,
            candidates=candidates,
            top_k=top_k
        )
        
        logger.info(f"✅ Gemini ranked {len(ranked_candidates)} candidates")
        
        return {
            "success": True,
            "ranked_candidates": ranked_candidates
        }
        
    except Exception as e:
        logger.error(f"Error in Gemini ranking: {e}")
        # Return original candidates on error
        return {
            "success": False,
            "message": str(e),
            "ranked_candidates": body.get("candidates", [])
        }


# ---------------------------------------------------------------------
# Embed Job API  (MULTI-SECTION, 384 DIM SAFE)
# ---------------------------------------------------------------------
@app.post("/api/embed-job")
async def embed_job(request: Request):

    body = await request.json()
    job_id = body.get("job_id")

    if not isinstance(job_id, int):
        raise HTTPException(400, "job_id must be an integer")

    if not SERVICE_STATUS["embeddings"]:
        raise HTTPException(503, "Embedding model not loaded")

    job = await db.get_job_data(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    sections = job_text_cleaner.build_job_embedding_sections(job)
    texts = [s["content"] for s in sections if s.get("content")]

    if not texts:
        raise HTTPException(400, "Nothing to embed")

    embeddings = await embedding_service.batch_encode(texts)

    embedded_sections = []
    for sec, emb in zip(sections, embeddings):
        embedded_sections.append({
            "section": sec["section"],
            "embedding": emb,
        })

    await db.upsert_job_section_embeddings(
        job_id=job_id,
        sections=embedded_sections,
        model_name=getattr(embedding_service, "model_name", ""),
    )

    logger.success(f"✅ Job embeddings stored for job_id={job_id}")

    return {
        "success": True,
        "job_id": job_id,
        "count": len(embedded_sections),
    }


@app.post("/api/embed-assessment")
async def embed_assessment(request: Request):
    body = await request.json()
    assessment_id = body.get("assessment_id")

    if not isinstance(assessment_id, int):
        raise HTTPException(400, "assessment_id must be an integer")

    if not embedding_service.is_loaded():
        raise HTTPException(503, "Embedding model not loaded")

    questions = await db.get_assessment_questions(assessment_id)
    if not questions:
        raise HTTPException(404, "Assessment questions not found")

    payload = []
    texts = []
    for question in questions:
        content = build_assessment_question_embedding_text(question)
        if not content:
            continue
        payload.append({
            "question_id": int(question.get("question_id")),
            "topic": str(question.get("topic") or "").strip(),
            "content": content,
        })
        texts.append(content)

    if not texts:
        raise HTTPException(400, "Assessment has no embeddable questions")

    embeddings = await embedding_service.batch_encode(texts)
    for item, embedding in zip(payload, embeddings):
        item["embedding"] = embedding

    await db.upsert_question_embeddings(
        assessment_id=assessment_id,
        questions=payload,
        model_name=getattr(embedding_service, "model_name", ""),
    )

    return {
        "success": True,
        "assessment_id": assessment_id,
        "count": len(payload),
    }


@app.post("/api/semantic/question-search")
async def semantic_question_search(request: Request):
    body = await request.json()
    assessment_id = body.get("assessment_id")
    query_text = str(body.get("query_text") or "").strip()
    top_k = max(1, min(int(body.get("top_k", 8) or 8), 20))
    exclude_question_ids = body.get("exclude_question_ids") or []

    if not isinstance(assessment_id, int):
        raise HTTPException(400, "assessment_id must be an integer")
    if not query_text:
        raise HTTPException(400, "query_text is required")
    if not embedding_service.is_loaded():
        raise HTTPException(503, "Embedding model not loaded")

    query_embedding = await embedding_service.encode(query_text)
    matches = await db.semantic_search_assessment_questions(
        assessment_id=assessment_id,
        query_embedding=query_embedding,
        top_k=top_k,
        exclude_question_ids=exclude_question_ids,
    )

    return {
        "success": True,
        "assessment_id": assessment_id,
        "count": len(matches),
        "matches": jsonable_encoder(matches),
    }


@app.post("/api/semantic/candidate-context")
async def semantic_candidate_context(request: Request):
    body = await request.json()
    candidate_email = str(body.get("candidate_email") or "").strip()
    query_text = str(body.get("query_text") or "").strip()
    top_k = max(1, min(int(body.get("top_k", 4) or 4), 12))

    if not candidate_email:
        raise HTTPException(400, "candidate_email is required")
    if not query_text:
        raise HTTPException(400, "query_text is required")
    if not embedding_service.is_loaded():
        raise HTTPException(503, "Embedding model not loaded")

    query_embedding = await embedding_service.encode(query_text)
    matches = await db.semantic_search_candidate_context(
        candidate_email=candidate_email,
        query_embedding=query_embedding,
        top_k=top_k,
    )

    return {
        "success": True,
        "candidate_email": candidate_email,
        "count": len(matches),
        "matches": jsonable_encoder(matches),
    }


# ---------------------------------------------------------------------
# Parse Resume API
# ---------------------------------------------------------------------
@app.post("/api/parse-resume")
async def parse_resume(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
        resume_id = body.get("resume_id")

        if not isinstance(resume_id, int):
            raise HTTPException(400, "resume_id must be an integer")

        logger.info(f"📥 Parse request received for resume_id={resume_id}")

        record = await db.get_resume_data(resume_id)
        if not record:
            raise HTTPException(404, "Resume not found")

        file_path = record.get("file_path")
        filename = record.get("original_filename") or "resume.pdf"

        path = normalize_windows_path(resume_id, file_path)
        if path is None:
            raise HTTPException(422, "Resume file not found on disk")

        # Parse resume
        parsed = await parser_service.parse_file(str(path), filename)
        logger.info(f"🧬 Raw parsed data keys: {list(parsed.keys()) if isinstance(parsed, dict) else 'NOT A DICT'}")
        
        parsed = normalize_parsed_data(parsed)
        parsed = resume_text_cleaner.clean_parsed_resume(parsed)

        email = (parsed.get("email") or "").strip()
        phone = (parsed.get("phone") or "").strip()
        logger.info(f"🔍 Normalized identifiers: email='{email}', phone='{phone}'")

        # 🔍 Duplicate check
        is_dup = False
        existing = None
        if email or phone:
            logger.info(f"🧐 Running duplicate check for email='{email}', phone='{phone}'")
            is_dup, existing = await duplicate_checker.check_duplicate(
                email,
                phone,
            )
            logger.info(f"🧐 Duplicate check result: is_dup={is_dup}")

        if is_dup:
            await db.update_resume_status(resume_id, "duplicate")
            safe_existing = jsonable_encoder(existing)
            return JSONResponse(
                status_code=409,
                content={
                    "error": "duplicate",
                    "existing_candidate": safe_existing,
                },
            )

        is_bulk = body.get("is_bulk", False)

        # ✅ New candidate → store parsed data if email exists AND is_bulk is true
        candidate_id = None
        if email and is_bulk:
            logger.info(f"💾 Storing parsed data for resume_id={resume_id}")
            candidate_id = await db.store_parsed_resume_data(resume_id, parsed)
            logger.info(f"✅ Stored candidate_id={candidate_id}")

            # 🔹 Section embeddings
            sections = resume_text_cleaner.build_embedding_sections(parsed)

            if sections and SERVICE_STATUS["embeddings"]:
                logger.info(f"🧠 Generating embeddings for {len(sections)} sections")
                texts = [s.get("content") for s in sections if s.get("content")]
                embeddings = await embedding_service.batch_encode(texts)

                await db.store_section_embeddings(
                    resume_id=resume_id,
                    candidate_id=candidate_id,
                    sections=sections,
                    embeddings=embeddings,
                )

                await db.store_candidate_embeddings(
                    candidate_id=candidate_id,
                    sections=sections,
                    embeddings=embeddings,
                )
        else:
            logger.warning(f"⚠️ No email found for resume_id={resume_id}. Skipping DB storage until manually added.")

        # 🔄 Background finalize
        background_tasks.add_task(
            process_resume_task,
            resume_id,
            str(path),
            filename,
            is_bulk,
        )

        logger.info(f"📤 Returning response for resume_id={resume_id}: email={email}, candidate_id={candidate_id}")
        
        return {
            "success": True,
            "resume_id": resume_id,
            "candidate_id": candidate_id,
            "parsed_data": {
                **{k: v for k, v in (parsed or {}).items() if k != "raw_text"},
                "raw_text": (parsed.get("raw_text") or "")[:10000],
            },
        }

    except HTTPException as h:
        raise h
    except Exception as e:
        logger.exception(f"💥 INTERNAL ERROR in parse_resume: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "success": False}
        )


# ---------------------------------------------------------------------
# Enhanced Recommendation API (Talent Pool Search)
# ---------------------------------------------------------------------
@app.post("/api/recommendations/search")
async def search_talent_pool(request: Request):
    """
    Search entire talent pool for best matching candidates
    """
    body = await request.json()
    job_id = body.get("job_id")
    filters = body.get("filters", {})
    top_k = body.get("top_k", 100)

    if not isinstance(job_id, int):
        raise HTTPException(400, "job_id must be an integer")

    if not SERVICE_STATUS["matching"]:
        raise HTTPException(503, "Matching service is still warming up")

    # Get job data
    job = await db.get_job_data(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    logger.info(f"🎯 Searching talent pool for job {job_id}")

    # Search talent pool
    matches = await enhanced_matcher.search_talent_pool(
        job_id=job_id,
        job_data=job,
        filters=filters,
        top_k=top_k,
    )

    logger.success(f"✅ Found {len(matches)} matches for job {job_id}")

    return {
        "success": True,
        "job_id": job_id,
        "count": len(matches),
        "data": matches,
    }


@app.post("/api/recommendations/generate")
async def generate_recommendations(request: Request, background_tasks: BackgroundTasks):
    """
    Generate recommendations for a job and store in database
    """
    body = await request.json()
    job_id = body.get("job_id")
    top_k = body.get("top_k", 100)

    if not isinstance(job_id, int):
        raise HTTPException(400, "job_id must be an integer")

    if not SERVICE_STATUS["matching"]:
        raise HTTPException(503, "Matching service is still warming up")

    # Get job data
    job = await db.get_job_data(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    logger.info(f"🎯 Generating recommendations for job {job_id}")

    # Generate recommendations in background
    async def _generate():
        try:
            matches = await enhanced_matcher.search_talent_pool(
                job_id=job_id,
                job_data=job,
                filters={},
                top_k=top_k,
            )

            # Store recommendations
            for match in matches:
                await db.upsert_job_recommendation(
                    job_id=job_id,
                    candidate_id=match['candidate_id'],
                    final_score=match['final_score'] / 100,  # Convert back to 0-1
                    scores={k: v / 100 for k, v in match.get('scores', {}).items()},
                    matched_skills=match.get('matched_skills', []),
                    missing_skills=match.get('missing_skills', []),
                    explanation=match.get('explanation', ''),
                )

            logger.success(f"✅ Stored {len(matches)} recommendations for job {job_id}")

        except Exception as e:
            logger.error(f"❌ Failed to generate recommendations: {e}")

    background_tasks.add_task(_generate)

    return {
        "success": True,
        "message": "Recommendation generation started",
        "job_id": job_id,
        "status": "processing",
    }


@app.get("/api/recommendations/{job_id}")
async def get_recommendations(job_id: int, status: str = None, limit: int = 50):
    """
    Get stored recommendations for a job
    """
    if not isinstance(job_id, int):
        raise HTTPException(400, "job_id must be an integer")

    recommendations = await db.get_job_recommendations(
        job_id=job_id,
        status=status,
        limit=limit,
    )

    return {
        "success": True,
        "job_id": job_id,
        "count": len(recommendations),
        "data": recommendations,
    }


@app.put("/api/recommendations/{job_id}/candidate/{candidate_id}/status")
async def update_recommendation_status(
    job_id: int,
    candidate_id: int,
    request: Request
):
    """
    Update recommendation status (viewed, shortlisted, rejected)
    """
    body = await request.json()
    status = body.get("status")

    if not status:
        raise HTTPException(400, "status is required")

    valid_statuses = ['new', 'viewed', 'shortlisted', 'rejected', 'hired']
    if status not in valid_statuses:
        raise HTTPException(400, f"status must be one of: {valid_statuses}")

    updated = await db.update_recommendation_status(
        job_id=job_id,
        candidate_id=candidate_id,
        status=status,
    )

    if not updated:
        raise HTTPException(404, "Recommendation not found")

    return {
        "success": True,
        "message": f"Status updated to {status}",
        "job_id": job_id,
        "candidate_id": candidate_id,
        "status": status,
    }


# ---------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8001,
        log_level="info",
    )
