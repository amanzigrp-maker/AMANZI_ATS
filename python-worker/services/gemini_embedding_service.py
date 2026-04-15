"""
Gemini Embedding Service
Generates vector embeddings using Google Gemini API
"""
import numpy as np
from typing import Dict, Any, List
from loguru import logger
from config import settings
import google.generativeai as genai


class GeminiEmbeddingService:
    """Generate vector embeddings using Gemini API for semantic search"""
    
    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.model_name = getattr(settings, "gemini_embedding_model", "text-embedding-004")
        self.embedding_dim = 768  # Gemini text-embedding-004 dimension
        
    async def load_models(self):
        """Configure Gemini API"""
        try:
            if not self.api_key:
                raise RuntimeError("GEMINI_API_KEY is not set")
            
            genai.configure(api_key=self.api_key)
            
            logger.info(f"✅ Gemini embeddings configured successfully")
            logger.info(f"Using model: {self.model_name}")
            logger.info(f"Embedding dimension: {self.embedding_dim}")
            
        except Exception as e:
            logger.error(f"Failed to configure Gemini embeddings: {e}")
            raise
    
    def is_loaded(self) -> bool:
        """Check if API is configured"""
        return self.api_key is not None
    
    async def generate_embeddings(self, resume_data: Dict[str, Any]) -> Dict[str, List[float]]:
        """
        Generate vector embeddings for different sections of the resume
        
        Args:
            resume_data: Parsed resume data with text content
            
        Returns:
            Dictionary with embeddings for different sections
        """
        try:
            if not self.api_key:
                raise RuntimeError("Gemini API not configured. Call load_models() first.")
            
            embeddings = {}
            
            # Full resume embedding
            full_text = resume_data.get('raw_text', '')
            if full_text:
                embeddings['full_resume_embedding'] = await self._encode_text(
                    full_text, 
                    task_type="retrieval_document"
                )
            
            # Skills embedding
            skills = resume_data.get('skills', [])
            if skills:
                skills_text = ', '.join(skills)
                embeddings['skills_embedding'] = await self._encode_text(
                    skills_text,
                    task_type="retrieval_document"
                )
            
            # Experience embedding
            experiences = resume_data.get('experience', [])
            if experiences:
                exp_text = ' '.join([exp.get('description', '') for exp in experiences])
                if exp_text:
                    embeddings['experience_embedding'] = await self._encode_text(
                        exp_text,
                        task_type="retrieval_document"
                    )
            
            # Education embedding
            education = resume_data.get('education', [])
            if education:
                edu_text = ' '.join([edu.get('description', '') for edu in education])
                if edu_text:
                    embeddings['education_embedding'] = await self._encode_text(
                        edu_text,
                        task_type="retrieval_document"
                    )
            
            logger.info(f"✅ Generated {len(embeddings)} Gemini embeddings")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating Gemini embeddings: {e}")
            raise
    
    async def generate_job_embedding(self, job_description: str, required_skills: List[str] = None) -> Dict[str, List[float]]:
        """
        Generate embeddings for job description
        
        Args:
            job_description: Job description text
            required_skills: List of required skills
            
        Returns:
            Dictionary with job embeddings
        """
        try:
            embeddings = {}
            
            # Job description embedding (use query task type for better matching)
            if job_description:
                embeddings['job_description_embedding'] = await self._encode_text(
                    job_description,
                    task_type="retrieval_query"
                )
            
            # Required skills embedding
            if required_skills:
                skills_text = ', '.join(required_skills)
                embeddings['required_skills_embedding'] = await self._encode_text(
                    skills_text,
                    task_type="retrieval_query"
                )
            
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating Gemini job embeddings: {e}")
            raise
    
    async def _encode_text(self, text: str, task_type: str = "retrieval_document") -> List[float]:
        """
        Encode text into vector embedding using Gemini API
        
        Args:
            text: Input text
            task_type: Either "retrieval_document" or "retrieval_query"
            
        Returns:
            List of floats representing the embedding vector
        """
        try:
            # Truncate if too long (Gemini has 2048 token limit)
            if len(text) > 10000:
                text = text[:10000]
            
            # Generate embedding using Gemini API
            result = genai.embed_content(
                model=f"models/{self.model_name}",
                content=text,
                task_type=task_type
            )
            
            # Extract embedding from result
            embedding = result['embedding']
            
            # Normalize for cosine similarity
            embedding_array = np.array(embedding)
            norm = np.linalg.norm(embedding_array)
            if norm > 0:
                embedding_array = embedding_array / norm
            
            return embedding_array.tolist()
            
        except Exception as e:
            logger.error(f"Error encoding text with Gemini: {e}")
            raise
    
    def calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """
        Calculate cosine similarity between two embeddings
        
        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector
            
        Returns:
            Similarity score between 0 and 1
        """
        try:
            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)
            
            # Cosine similarity
            similarity = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
            
            # Convert to 0-1 range (from -1 to 1)
            similarity = (similarity + 1) / 2
            
            return float(similarity)
            
        except Exception as e:
            logger.error(f"Error calculating similarity: {e}")
            return 0.0
    
    async def batch_encode(self, texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
        """
        Encode multiple texts in batch
        
        Args:
            texts: List of text strings
            task_type: Either "retrieval_document" or "retrieval_query"
            
        Returns:
            List of embedding vectors
        """
        try:
            embeddings = []
            
            # Gemini API doesn't have native batch support, so we process sequentially
            # Could be optimized with asyncio.gather for parallel requests
            for text in texts:
                embedding = await self._encode_text(text, task_type)
                embeddings.append(embedding)
            
            logger.info(f"✅ Batch encoded {len(embeddings)} texts with Gemini")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error in Gemini batch encoding: {e}")
            raise
