"""
Recommendation Database Operations
Handles PostgreSQL operations for the recommendation engine
"""

import json
import asyncio
from typing import Dict, Any, List, Optional
from loguru import logger


class RecommendationDatabase:
    """Database operations for job recommendations"""
    
    def __init__(self, db):
        self.db = db
    
    async def upsert_job_recommendation(
        self,
        job_id: int,
        candidate_id: int,
        final_score: float,
        scores: Dict[str, float],
        matched_skills: List[str],
        missing_skills: List[str],
        explanation: str,
    ) -> bool:
        """
        Upsert a job recommendation record
        """
        try:
            # Calculate score bucket
            score_bucket = 'hot' if final_score >= 0.8 else 'warm' if final_score >= 0.6 else 'cold'
            
            # Convert skills arrays to PostgreSQL format
            matched_skills_str = self.db.to_pg_text_array(matched_skills)
            missing_skills_str = self.db.to_pg_text_array(missing_skills)
            
            # Store scores as JSON
            scores_json = json.dumps(scores)
            
            def _upsert():
                conn = None
                try:
                    conn = self.db._get_conn()
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO job_recommendations (
                                job_id, candidate_id, final_score,
                                experience_score, skills_score, semantic_score,
                                education_score, location_score, industry_score, recency_score,
                                matched_skills, missing_skills, explanation,
                                recommendation_status, recommendation_score_bucket
                            )
                            VALUES (
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s, %s,
                                %s, %s, %s,
                                'new', %s
                            )
                            ON CONFLICT (job_id, candidate_id) DO UPDATE SET
                                final_score = EXCLUDED.final_score,
                                experience_score = EXCLUDED.experience_score,
                                skills_score = EXCLUDED.skills_score,
                                semantic_score = EXCLUDED.semantic_score,
                                education_score = EXCLUDED.education_score,
                                location_score = EXCLUDED.location_score,
                                industry_score = EXCLUDED.industry_score,
                                recency_score = EXCLUDED.recency_score,
                                matched_skills = EXCLUDED.matched_skills,
                                missing_skills = EXCLUDED.missing_skills,
                                explanation = EXCLUDED.explanation,
                                recommendation_status = 'new',
                                recommended_at = NOW()
                        """, (
                            job_id, candidate_id, final_score,
                            scores.get('experience', 0),
                            scores.get('skills', 0),
                            scores.get('semantic', 0),
                            scores.get('education', 0),
                            scores.get('location', 0),
                            scores.get('industry', 0),
                            scores.get('recency', 0),
                            matched_skills_str,
                            missing_skills_str,
                            explanation,
                            score_bucket,
                        ))
                        conn.commit()
                        return True
                except Exception as e:
                    logger.error(f"Error upserting recommendation: {e}")
                    if conn and getattr(conn, "closed", 0) == 0:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                    return False
                finally:
                    if conn:
                        self.db._put_conn(conn)
            
            return await self.db._run_sync(_upsert)
            
        except Exception as e:
            logger.error(f"Error in upsert_job_recommendation: {e}")
            return False
    
    async def get_job_recommendations(
        self,
        job_id: int,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get recommendations for a job with optional status filter
        """
        try:
            query = """
                SELECT 
                    jr.*,
                    c.full_name,
                    c.email,
                    c.phone,
                    c.current_designation,
                    c.current_company,
                    c.total_experience_years,
                    c.location,
                    c.skills
                FROM job_recommendations jr
                JOIN candidates c ON c.candidate_id = jr.candidate_id
                WHERE jr.job_id = %s
            """
            params = [job_id]
            
            if status:
                query += " AND jr.recommendation_status = %s"
                params.append(status)
            
            query += " ORDER BY jr.final_score DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            rows = await self.db._run_sync(
                self.db._fetchall_sync,
                query,
                tuple(params),
            )
            
            results = []
            for row in (rows or []):
                result = dict(row)
                # Parse skills array
                if result.get('skills') and isinstance(result['skills'], str):
                    # Remove braces and split
                    skills_str = result['skills'].strip('{}')
                    result['skills'] = [s.strip('"') for s in skills_str.split(',')] if skills_str else []
                results.append(result)
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting job recommendations: {e}")
            return []
    
    async def update_recommendation_status(
        self,
        job_id: int,
        candidate_id: int,
        status: str,
    ) -> bool:
        """
        Update recommendation status
        """
        try:
            # Determine which timestamp to update
            timestamp_column = {
                'viewed': 'viewed_at',
                'shortlisted': 'shortlisted_at',
                'rejected': 'rejected_at',
                'hired': 'shortlisted_at',  # reuse shortlisted_at
            }.get(status, None)
            
            if timestamp_column:
                query = f"""
                    UPDATE job_recommendations
                    SET recommendation_status = %s,
                        {timestamp_column} = NOW()
                    WHERE job_id = %s AND candidate_id = %s
                """
            else:
                query = """
                    UPDATE job_recommendations
                    SET recommendation_status = %s
                    WHERE job_id = %s AND candidate_id = %s
                """
            
            await self.db._run_sync(
                self.db._execute_sync,
                query,
                (status, job_id, candidate_id),
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating recommendation status: {e}")
            return False
    
    async def get_recommendation_stats(self, job_id: int) -> Dict[str, Any]:
        """
        Get recommendation statistics for a job
        """
        try:
            rows = await self.db._run_sync(
                self.db._fetchall_sync,
                """
                    SELECT 
                        recommendation_status,
                        recommendation_score_bucket,
                        COUNT(*) as count,
                        AVG(final_score) as avg_score
                    FROM job_recommendations
                    WHERE job_id = %s
                    GROUP BY recommendation_status, recommendation_score_bucket
                """,
                (job_id,),
            )
            
            stats = {
                'total': 0,
                'by_status': {},
                'by_bucket': {'hot': 0, 'warm': 0, 'cold': 0},
                'avg_score': 0,
            }
            
            total_score = 0
            count = 0
            
            for row in (rows or []):
                row = dict(row)
                status = row.get('recommendation_status')
                bucket = row.get('recommendation_score_bucket')
                c = row.get('count', 0)
                avg = row.get('avg_score')
                
                stats['total'] += c
                stats['by_status'][status] = c
                
                if bucket:
                    stats['by_bucket'][bucket] = c
                
                if avg:
                    total_score += avg * c
                    count += c
            
            if count > 0:
                stats['avg_score'] = round(total_score / count, 2)
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting recommendation stats: {e}")
            return {'total': 0, 'by_status': {}, 'by_bucket': {}, 'avg_score': 0}
    
    async def get_candidate_by_id(self, candidate_id: int) -> Optional[Dict[str, Any]]:
        """
        Get candidate by ID
        """
        try:
            row = await self.db._run_sync(
                self.db._fetchone_sync,
                """
                    SELECT 
                        c.*,
                        r.parsed_json
                    FROM candidates c
                    LEFT JOIN resumes r ON r.candidate_id = c.candidate_id
                    WHERE c.candidate_id = %s
                """,
                (candidate_id,),
            )
            
            if row:
                result = dict(row)
                # Parse parsed_json if exists
                if result.get('parsed_json') and isinstance(result['parsed_json'], str):
                    try:
                        result['parsed_json'] = json.loads(result['parsed_json'])
                    except Exception:
                        pass
                return result
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting candidate: {e}")
            return None
    
    async def get_all_candidates(
        self,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 5000,
    ) -> List[Dict[str, Any]]:
        """
        Get all candidates from database with optional filters
        """
        try:
            query = """
                SELECT 
                    c.candidate_id,
                    c.full_name,
                    c.email,
                    c.current_designation,
                    c.current_company,
                    c.total_experience_years,
                    c.location,
                    c.skills,
                    c.created_at,
                    c.updated_at
                FROM candidates c
                WHERE c.candidate_id > 0
            """
            
            params = []
            
            if filters:
                if filters.get('min_experience'):
                    query += " AND c.total_experience_years >= %s"
                    params.append(filters['min_experience'])
                
                if filters.get('max_experience'):
                    query += " AND c.total_experience_years <= %s"
                    params.append(filters['max_experience'])
                
                if filters.get('locations'):
                    locations = filters['locations']
                    if isinstance(locations, list) and locations:
                        placeholders = ', '.join(['%s'] * len(locations))
                        query += f" AND c.location IN ({placeholders})"
                        params.extend(locations)
                
                if filters.get('skills'):
                    skills = filters['skills']
                    if isinstance(skills, list) and skills:
                        for skill in skills:
                            query += " AND (%s = ANY(c.skills) OR c.skills::text ILIKE %s)"
                            params.append(skill)
                            params.append(f'%{skill}%')
            
            query += " ORDER BY c.created_at DESC LIMIT %s"
            params.append(limit)
            
            rows = await self.db._run_sync(
                self.db._fetchall_sync,
                query,
                tuple(params),
            )
            
            return [dict(row) for row in (rows or [])]
            
        except Exception as e:
            logger.error(f"Error getting candidates: {e}")
            return []
