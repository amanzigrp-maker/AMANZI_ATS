"""
Database Service
Handles PostgreSQL operations for the ATS.
"""

import os
import json
import re
import asyncio
import psycopg2
from pathlib import Path
from typing import Dict, Any, List, Optional
from loguru import logger
from dotenv import load_dotenv
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor


class Database:
    def __init__(self):
        try:
            repo_root = Path(__file__).resolve().parents[2]
            load_dotenv(repo_root / ".env", override=True)
        except Exception:
            pass
        self.pool: ThreadedConnectionPool | None = None


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

    async def get_assessment_questions(self, assessment_id: int) -> List[Dict[str, Any]]:
        if not assessment_id:
            return []

        rows = await self._run_sync(
            self._fetchall_sync,
            """
            SELECT
                q.question_id,
                qs.assessment_id,
                q.question_text,
                q.difficulty,
                q.difficulty_score,
                q.topic,
                q.explanation,
                q.correct_option,
                jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
            FROM question_sets qs
            JOIN questions q ON q.question_set_id = qs.question_set_id
            JOIN question_options o ON o.question_id = q.question_id
            WHERE qs.assessment_id = %s
            GROUP BY q.question_id, qs.assessment_id
            ORDER BY q.question_id ASC
            """,
            (assessment_id,),
        )

        return [dict(row) for row in (rows or [])]


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

    # ======================================================
    # Question Deduplication
    # ======================================================
    async def get_recent_questions(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch recent questions for quick string matching."""
        rows = await self._run_sync(
            self._fetchall_sync,
            "SELECT question_id as id, question_text as question FROM questions ORDER BY question_id DESC LIMIT %s",
            (limit,)
        )
        return [dict(row) if row else {} for row in (rows or [])]
