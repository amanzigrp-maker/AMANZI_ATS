"""
Matching Service
Calculates match scores between candidates and jobs using AI
"""
import numpy as np
from typing import Dict, Any, List, Tuple
from loguru import logger
from services.embedding_service import EmbeddingService

class MatchingService:
    """AI-powered candidate-job matching"""
    
    def __init__(self):
        self.embedding_service = EmbeddingService()
        
    async def find_matches(
        self, 
        job_id: int, 
        job_data: Dict[str, Any], 
        top_k: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Find and rank top candidates for a job
        
        Args:
            job_id: Job ID
            job_data: Job details including embeddings
            top_k: Number of top candidates to return
            
        Returns:
            List of candidate matches with scores
        """
        try:
            logger.info(f"Finding matches for job {job_id}")
            
            # This will be implemented with database queries
            # For now, returning structure
            matches = []
            
            return matches
            
        except Exception as e:
            logger.error(f"Error finding matches: {e}")
            raise
    
    def calculate_composite_score(
        self,
        semantic_similarity: float,
        skills_match: float,
        experience_match: float,
        education_match: float,
        weights: Dict[str, float] = None
    ) -> float:
        """
        Calculate composite match score from individual components
        
        Args:
            semantic_similarity: Overall semantic similarity (0-1)
            skills_match: Skills match score (0-1)
            experience_match: Experience match score (0-1)
            education_match: Education match score (0-1)
            weights: Custom weights for each component
            
        Returns:
            Composite score (0-100)
        """
        # Default weights
        if weights is None:
            weights = {
                'semantic': 0.35,
                'skills': 0.35,
                'experience': 0.20,
                'education': 0.10
            }
        
        # Calculate weighted score
        composite = (
            semantic_similarity * weights['semantic'] +
            skills_match * weights['skills'] +
            experience_match * weights['experience'] +
            education_match * weights['education']
        )
        
        # Convert to 0-100 scale
        return round(composite * 100, 2)
    
    def calculate_skills_match(
        self,
        candidate_skills: List[str],
        required_skills: List[str],
        preferred_skills: List[str] = None
    ) -> Tuple[float, List[str], List[str]]:
        """
        Calculate skills match score
        
        Returns:
            Tuple of (score, matched_skills, missing_skills)
        """
        if not required_skills:
            return 1.0, [], []
        
        # Normalize skills (lowercase)
        candidate_skills_lower = [s.lower() for s in candidate_skills]
        required_skills_lower = [s.lower() for s in required_skills]
        
        # Find matches
        matched = [s for s in required_skills if s.lower() in candidate_skills_lower]
        missing = [s for s in required_skills if s.lower() not in candidate_skills_lower]
        
        # Calculate score
        if len(required_skills) == 0:
            score = 1.0
        else:
            score = len(matched) / len(required_skills)
        
        # Bonus for preferred skills
        if preferred_skills:
            preferred_lower = [s.lower() for s in preferred_skills]
            preferred_matched = [s for s in preferred_skills if s.lower() in candidate_skills_lower]
            bonus = len(preferred_matched) * 0.05  # 5% bonus per preferred skill
            score = min(1.0, score + bonus)
        
        return score, matched, missing
    
    def calculate_experience_match(
        self,
        candidate_years: float,
        required_years: float,
        tolerance: float = 1.0
    ) -> float:
        """
        Calculate experience match score
        
        Args:
            candidate_years: Candidate's years of experience
            required_years: Required years of experience
            tolerance: Acceptable difference in years
            
        Returns:
            Match score (0-1)
        """
        if required_years == 0:
            return 1.0
        
        diff = abs(candidate_years - required_years)
        
        if diff <= tolerance:
            return 1.0
        elif diff <= tolerance * 2:
            return 0.8
        elif diff <= tolerance * 3:
            return 0.6
        elif candidate_years > required_years:
            # Overqualified is better than underqualified
            return 0.7
        else:
            return 0.4
