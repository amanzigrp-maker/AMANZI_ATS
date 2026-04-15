"""
Database Service
Handles PostgreSQL operations with pgvector support
"""

import os
import json
import re
import asyncio
import psycopg2
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Optional
from loguru import logger
from dotenv import load_dotenv
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
from pgvector.psycopg2 import register_vector


class Database:
    def __init__(self):
        try:
            repo_root = Path(__file__).resolve().parents[2]
            load_dotenv(repo_root / ".env", override=True)
        except Exception:
            pass
        self.pool: ThreadedConnectionPool | None = None

    def _ensure_vector_extension_sync(self, cur):
        # pgvector extension is required for VECTOR column type
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        except Exception:
            # if user doesn't have privilege, we'll fail later with clearer error
            raise

    def _ensure_candidate_embeddings_table_sync(self, cur):
        # Create table if missing. Use vector(384) to match MiniLM embedding dim.
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS candidate_embeddings (
                id SERIAL PRIMARY KEY,
                candidate_id INTEGER NOT NULL,
                section TEXT,
                content TEXT,
                embedding VECTOR(384),
                model_name TEXT
            )
            """
        )
        # Best-effort schema upgrades (older DBs may miss columns)
        try:
            cur.execute("ALTER TABLE candidate_embeddings ADD COLUMN IF NOT EXISTS content TEXT")
        except Exception:
            pass
        try:
            cur.execute("ALTER TABLE candidate_embeddings ADD COLUMN IF NOT EXISTS model_name TEXT")
        except Exception:
            pass
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_candidate_id ON candidate_embeddings (candidate_id)"
        )

    # ======================================================
    # Internal helpers (sync psycopg2 via executor)
    # ======================================================
    def _get_conn(self):
        if not self.pool:
            raise RuntimeError("DB pool not initialized")
        conn = self.pool.getconn()
        # If the pool hands us a dead connection, discard it and retry once.
        try:
            if getattr(conn, "closed", 0) != 0:
                try:
                    self.pool.putconn(conn, close=True)
                except Exception:
                    pass
                conn = self.pool.getconn()
        except Exception:
            pass
        try:
            register_vector(conn)
        except Exception:
            pass
        return conn

    def _put_conn(self, conn):
        if not self.pool or conn is None:
            return
        try:
            if getattr(conn, "closed", 0) != 0:
                # Ensure closed/broken connections don't get reused.
                self.pool.putconn(conn, close=True)
                return
            self.pool.putconn(conn)
        except Exception:
            # Last resort: try to close it
            try:
                conn.close()
            except Exception:
                pass

    def _run_sync(self, fn, *args):
        loop = asyncio.get_running_loop()
        return loop.run_in_executor(None, lambda: fn(*args))

    def _fetchone_sync(self, query: str, params: tuple = ()):
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                row = cur.fetchone()
                conn.commit()
                return dict(row) if row else None
        except Exception as e:
            if conn and getattr(conn, "closed", 0) == 0:
                try:
                    conn.rollback()
                except Exception:
                    pass
            if isinstance(e, psycopg2.InterfaceError) and e.args[0] == 'connection already closed':
                # Handle connection already closed error
                pass
            else:
                raise
        finally:
            if conn and getattr(conn, "closed", 0) != 0:
                try:
                    conn.close()
                except Exception:
                    pass
            else:
                self._put_conn(conn)

    def _fetchval_sync(self, query: str, params: tuple = ()):
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute(query, params)
                row = cur.fetchone()
                conn.commit()
                return row[0] if row else None
        except Exception as e:
            if conn and getattr(conn, "closed", 0) == 0:
                try:
                    conn.rollback()
                except Exception:
                    pass
            if isinstance(e, psycopg2.InterfaceError) and e.args[0] == 'connection already closed':
                # Handle connection already closed error
                pass
            else:
                raise
        finally:
            if conn and getattr(conn, "closed", 0) != 0:
                try:
                    conn.close()
                except Exception:
                    pass
            else:
                self._put_conn(conn)

    def _fetchall_sync(self, query: str, params: tuple = ()):
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchall()
        finally:
            if conn and getattr(conn, "closed", 0) != 0:
                try:
                    conn.close()
                except Exception:
                    pass
            else:
                self._put_conn(conn)

    def _execute_sync(self, query: str, params: tuple = ()):
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute(query, params)
                conn.commit()
        except Exception as e:
            if conn and getattr(conn, "closed", 0) == 0:
                try:
                    conn.rollback()
                except Exception:
                    pass
            if isinstance(e, psycopg2.InterfaceError) and e.args[0] == 'connection already closed':
                # Handle connection already closed error
                pass
            else:
                raise
        finally:
            if conn and getattr(conn, "closed", 0) != 0:
                try:
                    conn.close()
                except Exception:
                    pass
            else:
                self._put_conn(conn)

    # ======================================================
    # Connection
    # ======================================================
    async def connect(self):
        try:
            repo_root = Path(__file__).resolve().parents[2]
            load_dotenv(repo_root / ".env", override=True)
        except Exception:
            pass

        self.pool = ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            host=os.getenv("DB_HOST", "127.0.0.1"),
            port=int(os.getenv("DB_PORT", 5433)),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
        )

        conn = self._get_conn()
        self._put_conn(conn)

        logger.success("✅ Python DB pool connected")

    async def disconnect(self):
        if self.pool:
            await self._run_sync(self.pool.closeall)
            logger.info("DB pool closed")

    # ======================================================
    # Helpers
    # ======================================================
    @staticmethod
    def flatten_parsed_data(data: dict) -> dict:
        for key in ["full_name", "email", "phone", "location", "linkedin_url", "github_url"]:
            val = data.get(key)
            if isinstance(val, dict):
                data[key] = val.get("value") or ""
        return data

    @staticmethod
    def to_pg_text_array(values: list) -> str:
        if not values or not isinstance(values, list):
            return "{}"
        cleaned = []
        for v in values:
            if not v:
                continue
            v = str(v).replace('"', '').replace("'", "")
            cleaned.append(v)
        return "{" + ",".join(f'"{v}"' for v in cleaned) + "}"

    # ======================================================
    # Resume / Candidate
    # ======================================================
    async def get_resume_data(self, resume_id: int) -> Optional[Dict[str, Any]]:
        row = await self._run_sync(
            self._fetchone_sync,
            "SELECT * FROM resumes WHERE resume_id = %s",
            (resume_id,),
        )
        if row and row.get("parsed_json"):
            try:
                row["parsed_json"] = json.loads(row["parsed_json"])
            except Exception:
                pass
        return row

    async def create_resume_record(
        self,
        filename: str,
        file_path: str,
        file_size: int,
        job_id: Optional[int] = None,
    ) -> int:
        resume_id = await self._run_sync(
            self._fetchval_sync,
            """
            INSERT INTO resumes
            (original_filename, file_path, file_size_bytes, file_type, job_id)
            VALUES (%s,%s,%s,%s,%s)
            RETURNING resume_id
            """,
            (
                filename,
                file_path,
                file_size,
                filename.split(".")[-1].lower(),
                job_id,
            ),
        )
        return int(resume_id)

    async def store_parsed_resume_data(self, resume_id: int, parsed: Dict[str, Any]) -> int:
        parsed = self.flatten_parsed_data(parsed)

        email = (parsed.get("email") or "").strip()
        if not email:
            raise ValueError("Email is mandatory")

        full_name = (parsed.get("full_name") or "").strip()
        if not full_name or full_name.lower() == "unknown":
            # Satisfy DB check constraint (full_name_not_unknown_chk)
            # Fallback to something stable but non-'Unknown'
            local_part = email.split('@')[0] if email else ""
            full_name = local_part.title() if local_part else "Candidate"

        skills_pg = self.to_pg_text_array(parsed.get("skills", []))
        
        # Calculate total experience from experience_summary
        from utils.experience_calculator import calculate_total_experience
        total_exp_years = calculate_total_experience(parsed)

        candidate_id = await self._run_sync(
            self._fetchval_sync,
            "SELECT candidate_id FROM candidates WHERE email = %s",
            (email,),
        )

        if not candidate_id:
            candidate_id = await self._run_sync(
                self._fetchval_sync,
                """
                INSERT INTO candidates (
                    full_name, email, phone, location,
                    linkedin_url, github_url,
                    total_experience_years,
                    current_designation,
                    current_company,
                    skills
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::text[])
                RETURNING candidate_id
                """,
                (
                    full_name,
                    email,
                    parsed.get("phone"),
                    parsed.get("location"),
                    parsed.get("linkedin_url"),
                    parsed.get("github_url"),
                    total_exp_years,  # Use calculated value
                    parsed.get("current_designation"),
                    parsed.get("current_company"),
                    skills_pg,
                ),
            )

        await self._run_sync(
            self._execute_sync,
            """
            UPDATE resumes SET
                candidate_id = %s,
                raw_text = %s,
                parsed_json = %s,
                parsing_status = 'completed',
                processed_at = CURRENT_TIMESTAMP
            WHERE resume_id = %s
            """,
            (
                int(candidate_id),
                (parsed.get("raw_text") or "")[:10000],
                json.dumps(parsed),
                resume_id,
            ),
        )

        logger.success(f"✅ Parsed resume {resume_id} → candidate {candidate_id}")
        return int(candidate_id)

    # ======================================================
    # Resume status (🔥 MISSING METHOD FIXED)
    # ======================================================
    async def update_resume_status(
        self,
        resume_id: int,
        status: str,
        error_message: Optional[str] = None,
    ):
        await self._run_sync(
            self._execute_sync,
            """
            UPDATE resumes
            SET parsing_status = %s,
                error_message = %s,
                processed_at = CURRENT_TIMESTAMP
            WHERE resume_id = %s
            """,
            (status, error_message, resume_id),
        )

    # ======================================================
    # Embeddings (pgvector)
    # ======================================================
    async def store_section_embeddings(
        self,
        *,
        resume_id: int,
        candidate_id: int | None,
        sections: List[Dict[str, str]],
        embeddings: List[List[float]],
    ):
        if not sections or not embeddings:
            return

        if len(sections) != len(embeddings):
            raise ValueError("sections/embeddings length mismatch")

        def _store():
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_name = 'resume_section_embeddings'
                        """,
                    )
                    cols = {str(r[0]).lower() for r in (cur.fetchall() or [])}

                    has_resume_id = 'resume_id' in cols
                    has_candidate_id = 'candidate_id' in cols

                    # Choose best delete key available
                    if has_resume_id:
                        cur.execute(
                            "DELETE FROM resume_section_embeddings WHERE resume_id = %s",
                            (resume_id,),
                        )
                    elif has_candidate_id and candidate_id is not None:
                        cur.execute(
                            "DELETE FROM resume_section_embeddings WHERE candidate_id = %s",
                            (candidate_id,),
                        )
                    else:
                        # As a last resort, don't delete to avoid breaking; but we also can't reliably insert without a key.
                        raise RuntimeError(
                            "resume_section_embeddings schema missing both resume_id and candidate_id; cannot store embeddings"
                        )

                    # Build schema-flexible insert (only use existing columns)
                    insert_cols: List[str] = []
                    if has_resume_id:
                        insert_cols.append('resume_id')
                    if has_candidate_id:
                        insert_cols.append('candidate_id')
                    if 'section' in cols:
                        insert_cols.append('section')
                    if 'chunk_index' in cols:
                        insert_cols.append('chunk_index')
                    if 'content' in cols:
                        insert_cols.append('content')
                    if 'embedding' in cols:
                        insert_cols.append('embedding')
                    elif 'vector' in cols:
                        insert_cols.append('vector')
                    else:
                        raise RuntimeError(
                            "resume_section_embeddings schema missing embedding/vector column; cannot store embeddings"
                        )

                    placeholders = ",".join(["%s"] * len(insert_cols))
                    insert_sql = f"INSERT INTO resume_section_embeddings ({', '.join(insert_cols)}) VALUES ({placeholders})"

                    inserted = 0
                    for idx, (s, e) in enumerate(zip(sections, embeddings)):
                        if not s or not e:
                            continue

                        section = (s.get("section") or "").strip()
                        content = (s.get("content") or "").strip()
                        # We always need an embedding; other fields are optional depending on DB schema.
                        if not content and 'content' in cols:
                            # If schema expects content but we have none, skip this row.
                            continue

                        vector = np.asarray(e, dtype=np.float32)
                        values: List[Any] = []
                        for c in insert_cols:
                            if c == 'resume_id':
                                values.append(resume_id)
                            elif c == 'candidate_id':
                                values.append(candidate_id)
                            elif c == 'section':
                                values.append(section)
                            elif c == 'chunk_index':
                                values.append(idx)
                            elif c == 'content':
                                values.append(content)
                            elif c in ('embedding', 'vector'):
                                values.append(vector)
                            else:
                                values.append(None)

                        cur.execute(insert_sql, tuple(values))
                        inserted += 1

                conn.commit()
                return inserted
            except Exception:
                if conn and getattr(conn, "closed", 0) == 0:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                raise
            finally:
                self._put_conn(conn)

        inserted = await self._run_sync(_store)
        logger.success(f"✅ Stored {inserted} section embeddings for resume {resume_id}")

    async def store_candidate_embeddings(
        self,
        *,
        candidate_id: int,
        sections: List[Dict[str, str]],
        embeddings: List[List[float]],
    ):
        if not candidate_id:
            return
        if not sections or not embeddings:
            return
        if len(sections) != len(embeddings):
            raise ValueError("sections/embeddings length mismatch")

        def _store():
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    # Ensure schema exists
                    self._ensure_vector_extension_sync(cur)
                    self._ensure_candidate_embeddings_table_sync(cur)

                    # Detect optional columns
                    cur.execute(
                        """
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_name = 'candidate_embeddings'
                        """
                    )
                    cols = {str(r[0]).lower() for r in (cur.fetchall() or [])}
                    has_content = 'content' in cols
                    has_model_name = 'model_name' in cols

                    # Delete old embeddings for this candidate
                    cur.execute(
                        "DELETE FROM candidate_embeddings WHERE candidate_id = %s",
                        (candidate_id,),
                    )

                    insert_cols = ["candidate_id", "section", "embedding"]
                    if has_content:
                        insert_cols.append("content")
                    if has_model_name:
                        insert_cols.append("model_name")

                    placeholders = ", ".join(["%s"] * len(insert_cols))
                    sql = f"""
                        INSERT INTO candidate_embeddings
                        ({', '.join(insert_cols)})
                        VALUES ({placeholders})
                    """

                    inserted = 0
                    model_name = getattr(self, "model_name", "") or ""

                    for s, e in zip(sections, embeddings):
                        if not s or not e:
                            continue

                        section = (s.get("section") or "").strip()
                        if not section:
                            continue

                        # Convert to float32 numpy array (pgvector safe)
                        vector = np.asarray(e, dtype=np.float32)

                        values: List[Any] = [candidate_id, section, vector]
                        if has_content:
                            values.append((s.get("content") or "").strip())
                        if has_model_name:
                            values.append(model_name)

                        cur.execute(sql, tuple(values))
                        inserted += 1

                conn.commit()
                return inserted

            except Exception:
                if conn and getattr(conn, "closed", 0) == 0:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                raise
            finally:
                self._put_conn(conn)

        inserted = await self._run_sync(_store)
        logger.success(f"✅ Stored {inserted} candidate embeddings for candidate {candidate_id}")

    async def get_job_data(self, job_id: int) -> Optional[Dict[str, Any]]:
        if not job_id:
            return None

        row = await self._run_sync(
            self._fetchone_sync,
            """
            SELECT
                job_id,
                description,
                requirements,
                skills
            FROM jobs
            WHERE job_id = %s
            """,
            (job_id,),
        )

        if not row:
            return None

        job_description = (row.get("description") or "").strip()
        skills = row.get("skills")
        requirements = row.get("requirements")

        required_skills: str | None = None
        if isinstance(skills, list):
            cleaned = [str(s).strip() for s in skills if str(s).strip()]
            if cleaned:
                required_skills = ", ".join(cleaned)
        elif isinstance(skills, str) and skills.strip():
            required_skills = skills.strip()

        if (not required_skills) and isinstance(requirements, str) and requirements.strip():
            required_skills = requirements.strip()

        return {
            "job_id": int(row.get("job_id")) if row.get("job_id") is not None else job_id,
            "job_description": job_description,
            "required_skills": required_skills,
        }

    async def upsert_job_embeddings(
        self,
        *,
        job_id: int,
        required_skills_embedding: Optional[List[float]],
        job_description_embedding: Optional[List[float]],
        embedding_model: str,
    ):
        if not job_id:
            return

        def _store():
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    sql = """
                        INSERT INTO job_embeddings (
                            job_id,
                            required_skills_embedding,
                            job_description_embedding,
                            embedding_model
                        )
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (job_id)
                        DO UPDATE SET
                            required_skills_embedding = COALESCE(EXCLUDED.required_skills_embedding, job_embeddings.required_skills_embedding),
                            job_description_embedding = COALESCE(EXCLUDED.job_description_embedding, job_embeddings.job_description_embedding),
                            embedding_model = EXCLUDED.embedding_model,
                            created_at = NOW();
                    """

                    req_vec = (
                        np.asarray(required_skills_embedding, dtype=np.float32)
                        if required_skills_embedding
                        else None
                    )
                    desc_vec = (
                        np.asarray(job_description_embedding, dtype=np.float32)
                        if job_description_embedding
                        else None
                    )
                    cur.execute(sql, (job_id, req_vec, desc_vec, embedding_model))
                conn.commit()
            except Exception:
                if conn and getattr(conn, "closed", 0) == 0:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                raise
            finally:
                self._put_conn(conn)

        await self._run_sync(_store)
        logger.success(f"✅ Job embeddings upserted | job_id={job_id}")

    async def upsert_job_embedding(
        self,
        *,
        job_id: int,
        embedding: List[float],
        model_name: str,
    ):
        if not job_id:
            return
        if not embedding:
            return

        def _store():
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    sql = """
                        INSERT INTO job_embeddings (job_id, embedding, model_name)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (job_id)
                        DO UPDATE SET
                            embedding = EXCLUDED.embedding,
                            model_name = EXCLUDED.model_name,
                            created_at = NOW();
                    """
                    vector = np.asarray(embedding, dtype=np.float32)
                    cur.execute(sql, (job_id, vector, model_name))
                conn.commit()
            except Exception:
                if conn and getattr(conn, "closed", 0) == 0:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                raise
            finally:
                self._put_conn(conn)

        await self._run_sync(_store)
        logger.success(f"✅ Job embedding upserted | job_id={job_id}")

    async def upsert_job_section_embeddings(
        self,
        *,
        job_id: int,
        sections: List[Dict[str, Any]],
        model_name: str,
    ):
        if not job_id:
            return
        if not sections:
            return

        def _store():
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    self._ensure_vector_extension_sync(cur)

                    cur.execute(
                        "DELETE FROM job_section_embeddings WHERE job_id = %s",
                        (job_id,),
                    )

                    sql = """
                        INSERT INTO job_section_embeddings
                        (job_id, section, embedding, model_name)
                        VALUES (%s,%s,%s,%s)
                    """

                    inserted = 0
                    for s in sections:
                        if not isinstance(s, dict):
                            continue
                        section = str(s.get("section") or "").strip()
                        emb = s.get("embedding")
                        if not section or not emb:
                            continue

                        vector = np.asarray(emb, dtype=np.float32)
                        cur.execute(sql, (job_id, section, vector, model_name))
                        inserted += 1

                conn.commit()
                return inserted
            except Exception:
                if conn and getattr(conn, "closed", 0) == 0:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                raise
            finally:
                self._put_conn(conn)

        inserted = await self._run_sync(_store)
        logger.success(
            f"✅ Stored {inserted} job section embeddings for job_id={job_id}"
        )

    async def upsert_job_recommendation(
        self,
        *,
        job_id: int,
        candidate_id: int,
        final_score: float,
        scores: Dict[str, float] = None,
        matched_skills: List[str] = None,
        missing_skills: List[str] = None,
        explanation: str = "",
    ):
        """
        Upsert a job recommendation record with detailed scores and explanation.
        """
        if not job_id or not candidate_id:
            return

        def _store():
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    # Check if table exists
                    cur.execute("""
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_name = 'job_recommendations'
                        );
                    """)
                    exists = cur.fetchone()[0]
                    
                    if not exists:
                        # Create table if missing (standard schema from migration 020)
                        cur.execute("""
                            CREATE TABLE job_recommendations (
                                id SERIAL PRIMARY KEY,
                                job_id INTEGER NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
                                candidate_id INTEGER NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
                                match_score DECIMAL(5,4),
                                scores JSONB,
                                matched_skills TEXT[],
                                missing_skills TEXT[],
                                explanation TEXT,
                                status VARCHAR(50) DEFAULT 'pending',
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                UNIQUE(job_id, candidate_id)
                            )
                        """)
                    
                    # Check columns to handle different schema versions
                    cur.execute("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'job_recommendations'
                    """)
                    cols = {str(r[0]).lower() for r in cur.fetchall()}

                    # Map available columns
                    score_col = 'match_score' if 'match_score' in cols else ('score' if 'score' in cols else None)
                    has_scores_json = 'scores' in cols
                    has_matched_skills = 'matched_skills' in cols
                    has_missing_skills = 'missing_skills' in cols
                    has_explanation = 'explanation' in cols

                    if not score_col:
                        logger.warning("No score column found in job_recommendations")
                        return

                    insert_cols = ['job_id', 'candidate_id', score_col]
                    values = [job_id, candidate_id, final_score]

                    if has_scores_json:
                        insert_cols.append('scores')
                        values.append(json.dumps(scores or {}))
                    if has_matched_skills:
                        insert_cols.append('matched_skills')
                        values.append(matched_skills or [])
                    if has_missing_skills:
                        insert_cols.append('missing_skills')
                        values.append(missing_skills or [])
                    if has_explanation:
                        insert_cols.append('explanation')
                        values.append(explanation)

                    placeholders = ", ".join(["%s"] * len(values))
                    update_parts = [f"{c} = EXCLUDED.{c}" for c in insert_cols if c not in ('job_id', 'candidate_id')]
                    update_parts.append("created_at = NOW()")
                    
                    sql = f"""
                        INSERT INTO job_recommendations ({', '.join(insert_cols)})
                        VALUES ({placeholders})
                        ON CONFLICT (job_id, candidate_id)
                        DO UPDATE SET {', '.join(update_parts)}
                    """
                    cur.execute(sql, tuple(values))
                    
                conn.commit()
            except Exception as e:
                if conn and getattr(conn, "closed", 0) == 0:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                logger.error(f"Error upserting job recommendation: {e}")
                raise
            finally:
                self._put_conn(conn)

        await self._run_sync(_store)
