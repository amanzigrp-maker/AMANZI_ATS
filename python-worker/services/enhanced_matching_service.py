"""
Enhanced Matching Service
Provides comprehensive 7-factor candidate-job matching for talent pool search
"""
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from loguru import logger
from services.embedding_service import EmbeddingService
from database.db import Database


class EnhancedMatchingService:
    """
    AI-powered comprehensive candidate-job matching with 7 scoring dimensions:
    - Experience Match (25%)
    - Skills Match (25%)
    - Semantic Similarity (20%)
    - Education Match (10%)
    - Location Match (10%)
    - Industry Match (5%)
    - Recency Score (5%)
    """
    
    # Scoring weights
    WEIGHTS = {
        'experience': 0.25,
        'skills': 0.25,
        'semantic': 0.20,
        'education': 0.10,
        'location': 0.10,
        'industry': 0.05,
        'recency': 0.05,
    }
    
    def __init__(self, db: Database | None = None, embedding_service: Any = None):
        # Use provided or get configured embedding service
        if embedding_service:
            self.embedding_service = embedding_service
        else:
            from services.embedding_factory import get_embedding_service
            self.embedding_service = get_embedding_service()
            
        # IMPORTANT: use shared DB instance (already connected) when provided.
        # If not provided, we fall back to a new Database() (may require connect()).
        self.db = db or Database()
        
    async def load_models(self):
        """Load required models"""
        # If the embedding service is already loaded (from outside), we skip
        if hasattr(self.embedding_service, 'is_loaded') and self.embedding_service.is_loaded():
            return
        await self.embedding_service.load_models()
    
    async def search_talent_pool(
        self,
        job_id: int,
        job_data: Dict[str, Any],
        filters: Optional[Dict[str, Any]] = None,
        top_k: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Search entire talent pool for best matching candidates
        
        Args:
            job_id: Job ID to match against
            job_data: Job details including embeddings
            filters: Optional filters (experience, location, skills)
            top_k: Number of top candidates to return
            
        Returns:
            List of candidate matches with comprehensive scores
        """
        try:
            logger.info(f"Searching talent pool for job {job_id}")
            
            # Get all candidates with embeddings
            candidates = await self._get_candidates_with_embeddings(filters)
            
            if not candidates:
                logger.warning(f"No candidates found for job {job_id}")
                return []
            
            # Calculate scores for each candidate
            matches = []
            for candidate in candidates:
                match_result = await self.calculate_comprehensive_match(
                    job_id=job_id,
                    job_data=job_data,
                    candidate=candidate
                )
                if match_result:
                    matches.append(match_result)
            
            # Sort by final score descending
            matches.sort(key=lambda x: x['final_score'], reverse=True)
            
            # Return top k
            logger.success(f"Found {len(matches)} matches, returning top {top_k}")
            return matches[:top_k]
            
        except Exception as e:
            logger.error(f"Error searching talent pool: {e}")
            raise
    
    async def calculate_comprehensive_match(
        self,
        job_id: int,
        job_data: Dict[str, Any],
        candidate: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate comprehensive match score across all 7 dimensions
        
        Args:
            job_id: Job ID
            job_data: Job details
            candidate: Candidate details
            
        Returns:
            Match result with scores and explanations
        """
        try:
            # Extract job requirements
            required_skills = job_data.get('skills') or []
            required_experience = job_data.get('min_experience_years') or 0
            job_location = job_data.get('location', '')
            job_industry = job_data.get('industry', '')
            job_description = job_data.get('description', '')
            
            # Extract candidate data
            candidate_skills = candidate.get('skills') or []
            candidate_experience = float(candidate.get('total_experience_years') or 0)
            candidate_location = candidate.get('location', '')
            candidate_industry = candidate.get('current_company', '')
            
            # Calculate individual scores
            scores = {
                'experience': self._calculate_experience_score(
                    candidate_experience, required_experience
                ),
                'skills': self._calculate_skills_match(
                    candidate_skills, required_skills
                )[0],
                'semantic': await self._calculate_semantic_similarity(
                    job_description, candidate
                ),
                'education': self._calculate_education_match(
                    candidate.get('education', []), job_data.get('preferred_education')
                ),
                'location': self._calculate_location_score(
                    candidate_location, job_location
                ),
                'industry': self._calculate_industry_score(
                    candidate_industry, job_industry
                ),
                'recency': self._calculate_recency_score(
                    candidate.get('updated_at') or candidate.get('created_at')
                ),
            }
            
            # Calculate weighted final score
            final_score = sum(scores[k] * self.WEIGHTS[k] for k in self.WEIGHTS)
            
            # Get matched/missing skills
            skills_result = self._calculate_skills_match(candidate_skills, required_skills)
            matched_skills = skills_result[1]
            missing_skills = skills_result[2]
            
            # Build explanation
            explanation = self._build_match_explanation(scores, matched_skills, missing_skills)
            
            return {
                'candidate_id': candidate.get('candidate_id'),
                'job_id': job_id,
                'final_score': round(final_score * 100, 2),  # Convert to percentage
                'scores': {k: round(v * 100, 2) for k, v in scores.items()},
                'matched_skills': matched_skills,
                'missing_skills': missing_skills,
                'explanation': explanation,
                'candidate': {
                    'full_name': candidate.get('full_name'),
                    'email': candidate.get('email'),
                    'current_designation': candidate.get('current_designation'),
                    'current_company': candidate.get('current_company'),
                    'total_experience_years': candidate_experience,
                    'location': candidate_location,
                    'skills': candidate_skills,
                }
            }
            
        except Exception as e:
            logger.error(f"Error calculating match: {e}")
            return None
    
    def _calculate_experience_score(
        self,
        candidate_years: float,
        required_years: float
    ) -> float:
        """
        Calculate experience match score (0-1)
        
        Scoring:
        - Perfect match (within tolerance): 1.0
        - Slightly overqualified: 0.9
        - Underqualified but acceptable: 0.7
        - Significantly underqualified: 0.4
        """
        if required_years == 0:
            return 1.0
        
        diff = candidate_years - required_years
        tolerance = 1.0  # 1 year tolerance
        
        if abs(diff) <= tolerance:
            return 1.0
        elif diff > tolerance:
            # Overqualified - slight penalty but still good
            return max(0.8, 1.0 - (diff - tolerance) * 0.05)
        elif diff >= -tolerance * 2:
            # Underqualified by 1-2 years
            return 0.7
        elif diff >= -tolerance * 3:
            # Underqualified by 2-3 years
            return 0.5
        else:
            # Significantly underqualified
            return max(0.2, 0.4 - (abs(diff) - tolerance * 3) * 0.05)
    
    def _calculate_skills_match(
        self,
        candidate_skills: List[str],
        required_skills: List[str],
        preferred_skills: Optional[List[str]] = None
    ) -> Tuple[float, List[str], List[str]]:
        """
        Calculate skills match score (0-1)
        
        Returns:
            Tuple of (score, matched_skills, missing_skills)
        """
        if not required_skills:
            return 1.0, [], []
        
        # Normalize skills (lowercase)
        candidate_skills_lower = [s.lower().strip() for s in candidate_skills]
        required_skills_lower = [s.lower().strip() for s in required_skills]
        
        # Find exact matches
        matched = []
        missing = []
        
        for skill in required_skills:
            skill_lower = skill.lower().strip()
            # Check for exact match or partial match
            found = any(
                skill_lower in cs or cs in skill_lower
                for cs in candidate_skills_lower
            )
            if found:
                matched.append(skill)
            else:
                missing.append(skill)
        
        # Calculate base score
        if len(required_skills) == 0:
            score = 1.0
        else:
            score = len(matched) / len(required_skills)
        
        # Bonus for preferred skills
        if preferred_skills:
            preferred_lower = [s.lower().strip() for s in preferred_skills]
            preferred_matched = sum(
                1 for ps in preferred_lower
                if any(ps in cs or cs in ps for cs in candidate_skills_lower)
            )
            bonus = min(0.2, preferred_matched * 0.05)  # Max 20% bonus
            score = min(1.0, score + bonus)
        
        return score, matched, missing
    
    async def _calculate_semantic_similarity(
        self,
        job_description: str,
        candidate: Dict[str, Any]
    ) -> float:
        """
        Calculate semantic similarity using embeddings
        """
        try:
            if not self.embedding_service.is_loaded():
                return 0.5  # Default score if embeddings not available
            
            # Build candidate text from available data
            candidate_text_parts = []
            
            # Experience descriptions
            if 'experience' in candidate:
                for exp in (candidate.get('experience') or []):
                    desc = exp.get('description', '')
                    if desc:
                        candidate_text_parts.append(desc)
            
            # Skills
            skills = candidate.get('skills') or []
            if skills:
                candidate_text_parts.append(', '.join(skills))
            
            # Current designation
            designation = candidate.get('current_designation')
            if designation:
                candidate_text_parts.append(designation)
            
            if not candidate_text_parts:
                return 0.5
            
            candidate_text = ' '.join(candidate_text_parts)
            
            # Truncate for embedding
            if len(candidate_text) > 3000:
                candidate_text = candidate_text[:3000]
            if len(job_description) > 3000:
                job_description = job_description[:3000]
            
            # Generate embeddings
            job_embedding = await self.embedding_service._encode_text(job_description)
            candidate_embedding = await self.embedding_service._encode_text(candidate_text)
            
            # Calculate cosine similarity
            similarity = self.embedding_service.calculate_similarity(
                job_embedding, candidate_embedding
            )
            
            return similarity
            
        except Exception as e:
            logger.warning(f"Error calculating semantic similarity: {e}")
            return 0.5
    
    def _calculate_education_match(
        self,
        candidate_education: List[Dict[str, Any]],
        preferred_education: Optional[List[str]] = None
    ) -> float:
        """
        Calculate education match score (0-1)
        
        Education hierarchy: PhD > Master's > Bachelor's > Diploma > High School
        """
        if not candidate_education:
            return 0.5  # Default score
        
        education_levels = {
            'phd': 5, 'doctorate': 5, 'ph.d': 5,
            'master': 4, 'mba': 4, 'masters': 4,
            'bachelor': 3, 'bachelors': 3, 'be': 3, 'bs': 3, 'b.tech': 3,
            'diploma': 2,
            'high school': 1, '12th': 1, '10th': 1,
        }
        
        # Get highest education level
        max_level = 0
        for edu in candidate_education:
            degree = str(edu.get('degree', '')).lower()
            for key, level in education_levels.items():
                if key in degree:
                    max_level = max(max_level, level)
                    break
        
        if max_level == 0:
            return 0.5
        
        # If no preference, full match
        if not preferred_education:
            return 1.0 if max_level >= 3 else 0.7  # Bachelor's or higher = 1.0
        
        # Check against preferred
        for pref in preferred_education:
            pref_lower = pref.lower()
            for key, level in education_levels.items():
                if key in pref_lower:
                    if max_level >= level:
                        return 1.0
                    elif max_level >= level - 1:
                        return 0.7
                    else:
                        return 0.4
        
        return 0.5
    
    def _calculate_location_score(
        self,
        candidate_location: str,
        job_location: str
    ) -> float:
        """
        Calculate location match score (0-1)
        """
        if not job_location:
            return 1.0  # No location requirement
        
        if not candidate_location:
            return 0.3  # No location specified
        
        job_loc_lower = job_location.lower().strip()
        cand_loc_lower = candidate_location.lower().strip()
        
        # Exact match
        if job_loc_lower == cand_loc_lower:
            return 1.0
        
        # Check if job location is contained in candidate location
        if job_loc_lower in cand_loc_lower or cand_loc_lower in job_loc_lower:
            return 0.9
        
        # Check for common variations
        # E.g., "NYC" vs "New York", "SF" vs "San Francisco"
        city_mappings = {
            'nyc': 'new york', 'new york city': 'new york',
            'sf': 'san francisco', 'san fran': 'san francisco',
            'la': 'los angeles',
            'chi': 'chicago',
            'sea': 'seattle',
            'aus': 'austin',
            'bos': 'boston',
            'den': 'denver',
            'atl': 'atlanta',
            'dal': 'dallas',
            'mia': 'miami',
            'phx': 'phoenix',
        }
        
        # Normalize
        job_normalized = city_mappings.get(job_loc_lower, job_loc_lower)
        cand_normalized = city_mappings.get(cand_loc_lower, cand_loc_lower)
        
        if job_normalized == cand_normalized:
            return 0.85
        
        # Remote work consideration
        if 'remote' in job_loc_lower or 'remote' in cand_loc_lower:
            return 0.95
        
        if 'hybrid' in job_loc_lower:
            if 'remote' in cand_loc_lower:
                return 0.8
            return 0.7
        
        return 0.5
    
    def _calculate_industry_score(
        self,
        candidate_industry: str,
        job_industry: str
    ) -> float:
        """
        Calculate industry match score (0-1)
        """
        if not job_industry:
            return 1.0
        
        if not candidate_industry:
            return 0.5
        
        job_ind_lower = job_industry.lower().strip()
        cand_ind_lower = candidate_industry.lower().strip()
        
        # Exact match
        if job_ind_lower == cand_ind_lower:
            return 1.0
        
        # Partial match
        if job_ind_lower in cand_ind_lower or cand_ind_lower in job_ind_lower:
            return 0.8
        
        # Common industry categories
        tech_keywords = ['software', 'tech', 'it', 'technology', 'saas', 'cloud']
        finance_keywords = ['finance', 'banking', 'investment', 'fintech', 'insurance']
        healthcare_keywords = ['health', 'medical', 'pharma', 'biotech', 'healthcare']
        consulting_keywords = ['consulting', 'advisory', 'professional services']
        ecommerce_keywords = ['ecommerce', 'e-commerce', 'retail', 'online']
        
        def get_industry_category(text):
            text_lower = text.lower()
            if any(kw in text_lower for kw in tech_keywords):
                return 'tech'
            if any(kw in text_lower for kw in finance_keywords):
                return 'finance'
            if any(kw in text_lower for kw in healthcare_keywords):
                return 'healthcare'
            if any(kw in text_lower for kw in consulting_keywords):
                return 'consulting'
            if any(kw in text_lower for kw in ecommerce_keywords):
                return 'ecommerce'
            return 'other'
        
        job_cat = get_industry_category(job_ind_lower)
        cand_cat = get_industry_category(cand_ind_lower)
        
        if job_cat == cand_cat and job_cat != 'other':
            return 0.7
        
        return 0.5
    
    def _calculate_recency_score(self, updated_at: Any) -> float:
        """
        Calculate recency score based on last update (0-1)
        Recent profiles are weighted higher
        """
        from datetime import datetime, timezone
        
        if not updated_at:
            return 0.5
        
        try:
            if isinstance(updated_at, str):
                updated_at = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
            
            now = datetime.now(timezone.utc)
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
            
            days_since_update = (now - updated_at).days
            
            # Scoring based on recency
            if days_since_update <= 7:
                return 1.0
            elif days_since_update <= 30:
                return 0.9
            elif days_since_update <= 90:
                return 0.75
            elif days_since_update <= 180:
                return 0.6
            elif days_since_update <= 365:
                return 0.4
            else:
                return 0.2
                
        except Exception:
            return 0.5
    
    def _build_match_explanation(
        self,
        scores: Dict[str, float],
        matched_skills: List[str],
        missing_skills: List[str]
    ) -> str:
        """Build a human-readable match explanation"""
        explanations = []
        
        # Overall assessment
        avg_score = sum(scores.values()) / len(scores)
        if avg_score >= 0.8:
            overall = "Excellent match"
        elif avg_score >= 0.6:
            overall = "Good match"
        elif avg_score >= 0.4:
            overall = "Moderate match"
        else:
            overall = "Partial match"
        
        # Key strengths
        strengths = []
        for factor, score in scores.items():
            if score >= 0.8:
                if factor == 'experience':
                    strengths.append("strong experience")
                elif factor == 'skills':
                    strengths.append("relevant skills")
                elif factor == 'semantic':
                    strengths.append("well-aligned background")
                elif factor == 'education':
                    strengths.append("strong educational background")
                elif factor == 'location':
                    strengths.append("convenient location")
                elif factor == 'industry':
                    strengths.append("relevant industry experience")
                elif factor == 'recency':
                    strengths.append("recently updated profile")
        
        if strengths:
            explanations.append(overall + " with " + ", ".join(strengths[:2]) + ".")
        else:
            explanations.append(overall + ".")
        
        # Skills highlight
        if matched_skills:
            explanations.append(f"Has {len(matched_skills)} relevant skills.")
        if missing_skills and len(missing_skills) <= 3:
            explanations.append(f"Missing: {', '.join(missing_skills)}")
        
        return " ".join(explanations)
    
    async def _get_candidates_with_embeddings(
        self,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch candidates from database with optional filters
        """
        try:
            # Build query based on filters
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
            
            # Apply filters
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
                        # Skills filter using ANY
                        skills_conditions = []
                        for skill in skills:
                            skills_conditions.append("%s = ANY(c.skills)")
                            params.append(skill)
                        if skills_conditions:
                            query += " AND (" + " OR ".join(skills_conditions) + ")"
            
            query += " ORDER BY c.created_at DESC LIMIT 5000"
            
            result = await self.db._run_sync(
                self.db._fetchall_sync,
                query,
                tuple(params) if params else ()
            )
            
            return [dict(row) for row in (result or [])]
            
        except Exception as e:
            logger.error(f"Error fetching candidates: {e}")
            return []
    
    def calculate_final_score(self, scores: Dict[str, float]) -> float:
        """
        Calculate weighted final score from individual scores
        
        Args:
            scores: Dictionary of factor scores (0-1)
            
        Returns:
            Weighted final score (0-1)
        """
        return sum(scores[k] * self.WEIGHTS[k] for k in self.WEIGHTS)
