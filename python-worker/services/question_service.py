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

    def __init__(self, db, embedding_service):
        """
        Args:
            db: Database connection instance
            embedding_service: Service to generate embeddings
        """
        self.db = db
        self.embedding_service = embedding_service
        self.similarity_threshold_duplicate = 0.80
        self.similarity_threshold_similar = 0.60
        self.string_match_threshold = 90.0  # Percentage for RapidFuzz

    async def check_question_duplicate(self, question_text: str) -> Dict[str, Any]:
        """
        Check if a question is a duplicate or similar to existing ones.
        
        Logic:
        1. Quick string similarity check with RapidFuzz
        2. Generate embedding for the question
        3. Query top 5 nearest neighbors from DB (pgvector)
        4. Classify based on cosine similarity
        5. Store if "new"
        """
        try:
            question_text = question_text.strip()
            if not question_text:
                raise ValueError("Question text cannot be empty")

            # 1. Quick String Similarity Check (Optional Optimization)
            # Fetch recent questions for a quick fuzzy match
            recent_questions = await self.db.get_recent_questions(limit=100)
            if recent_questions:
                questions_list = [q['question'] for q in recent_questions]
                match = process.extractOne(
                    question_text, 
                    questions_list, 
                    scorer=fuzz.token_sort_ratio
                )
                
                if match and match[1] >= self.string_match_threshold:
                    matched_q = next(q for q in recent_questions if q['question'] == match[0])
                    logger.info(f"🔍 Quick match found: {match[1]}% similarity via RapidFuzz")
                    return {
                        "status": "duplicate",
                        "similarity": round(match[1] / 100.0, 4),
                        "matched_question": match[0],
                        "matched_id": matched_q.get('id')
                    }

            # 2. Generate Embedding
            if not self.embedding_service.is_loaded():
                await self.embedding_service.load_models()
            
            embedding = await self.embedding_service._encode_text(question_text)
            
            # 3. Query Top 5 Nearest Neighbors
            matches = await self.db.find_similar_questions(embedding, limit=5)
            
            if not matches:
                # No existing questions, it's definitely new
                await self.db.store_question(question_text, embedding)
                return {
                    "status": "new",
                    "similarity": 0.0,
                    "matched_question": None
                }

            # 4. Classify based on highest similarity
            best_match = matches[0]
            similarity = best_match.get('similarity', 0.0)
            matched_text = best_match.get('question', '')

            if similarity >= self.similarity_threshold_duplicate:
                status = "duplicate"
            elif similarity >= self.similarity_threshold_similar:
                status = "similar"
            else:
                status = "new"

            # 5. If "new", store it
            if status == "new":
                await self.db.store_question(question_text, embedding)
                logger.info(f"✅ New question stored: {question_text[:50]}...")
            else:
                logger.info(f"🚫 Question classified as {status} (Similarity: {similarity:.4f})")

            return {
                "status": status,
                "similarity": round(float(similarity), 4),
                "matched_question": matched_text if status != "new" else None
            }

        except Exception as e:
            logger.error(f"Error checking question duplicate: {e}")
            raise
