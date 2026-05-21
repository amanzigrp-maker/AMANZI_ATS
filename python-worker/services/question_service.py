"""
Question Deduplication Service
Detects duplicate or semantically similar interview questions using RapidFuzz and Vector Embeddings.
"""

from typing import Dict, Any, List, Optional, Tuple
from loguru import logger
from rapidfuzz import fuzz, process
import numpy as np

class QuestionService:
    """Service to check for duplicate interview questions."""

    def __init__(self, db):
        """
        Args:
            db: Database connection instance
        """
        self.db = db
        self.string_match_threshold = 90.0  # Percentage for RapidFuzz

    async def check_question_duplicate(self, question_text: str) -> Dict[str, Any]:
        """
        Check if a question is a duplicate or similar to existing ones using string matching.
        """
        try:
            question_text = question_text.strip()
            if not question_text:
                raise ValueError("Question text cannot be empty")

            # Quick String Similarity Check
            # Fetch recent questions for a quick fuzzy match
            recent_questions = await self.db.get_recent_questions(limit=500)
            if recent_questions:
                questions_list = [q['question'] for q in recent_questions]
                match = process.extractOne(
                    question_text, 
                    questions_list, 
                    scorer=fuzz.token_sort_ratio
                )
                
                if match and match[1] >= self.string_match_threshold:
                    matched_q = next(q for q in recent_questions if q['question'] == match[0])
                    logger.info(f"🔍 Match found: {match[1]}% similarity via RapidFuzz")
                    return {
                        "status": "duplicate",
                        "similarity": round(match[1] / 100.0, 4),
                        "matched_question": match[0],
                        "matched_id": matched_q.get('id')
                    }

            # If no close match found
            return {
                "status": "new",
                "similarity": 0.0,
                "matched_question": None
            }

        except Exception as e:
            logger.error(f"Error checking question duplicate: {e}")
            raise
