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
        """Configure Gemini API and verify model availability"""
        if not settings.enable_semantic_search:
            logger.info("ℹ️ Semantic search is disabled via ENABLE_SEMANTIC_SEARCH. Skipping embedding initialization.")
            self.api_key = None
            return

        try:
            if not self.api_key:
                logger.warning("⚠️ GEMINI_API_KEY is not set. Optional embedding service disabled.")
                return
            
            genai.configure(api_key=self.api_key)
            
            # Verify if the model is available to avoid 404s later
            try:
                # We try a very small test embedding
                genai.embed_content(
                    model=f"models/{self.model_name}",
                    content="test",
                    task_type="retrieval_document"
                )
                logger.success(f"✅ Gemini embedding model '{self.model_name}' verified")
            except Exception as e:
                if "404" in str(e):
                    if self.model_name != "embedding-001":
                        logger.warning(f"⚠️ Model '{self.model_name}' not found. Trying 'embedding-001'...")
                        self.model_name = "embedding-001"
                        try:
                            genai.embed_content(
                                model=f"models/embedding-001",
                                content="test",
                                task_type="retrieval_document"
                            )
                            logger.success(f"✅ Using fallback model 'embedding-001'")
                        except Exception:
                            logger.warning("⚠️ No compatible Gemini embedding models found. Optional semantic search disabled.")
                            self.api_key = None # Effectively disable
                    else:
                        logger.warning("⚠️ Gemini embedding model 'embedding-001' not found. Optional semantic search disabled.")
                        self.api_key = None
                else:
                    logger.warning(f"⚠️ Gemini embedding verification failed: {e}. Semantic search disabled.")
                    self.api_key = None
            
            if self.api_key:
                logger.info(f"📊 Gemini Embeddings: READY (Dim: {self.embedding_dim})")
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to configure optional Gemini embeddings: {e}")
            self.api_key = None
    
    def is_loaded(self) -> bool:
        """Check if API is configured"""
        return self.api_key is not None and settings.enable_semantic_search
    
    async def generate_embeddings(self, resume_data: Dict[str, Any]) -> Dict[str, List[float]]:
        """
        Generate vector embeddings for different sections of the resume
        """
        if not self.is_loaded():
            return {}

        try:
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
        """
        try:
            if not text or not isinstance(text, str):
                return [0.0] * self.embedding_dim

            # Truncate if too long (Gemini has 2048 token limit approx)
            if len(text) > 8000:
                text = text[:8000]
            
            # Generate embedding using Gemini API
            # Note: models/ prefix is added automatically by some SDK versions, 
            # but we'll stick to a clean model name.
            model_path = f"models/{self.model_name}" if not self.model_name.startswith("models/") else self.model_name
            
            result = genai.embed_content(
                model=model_path,
                content=text,
                task_type=task_type
            )
            
            # Extract embedding from result
            embedding = result.get('embedding')
            if not embedding:
                logger.error(f"Gemini returned empty embedding for {model_path}")
                return [0.0] * self.embedding_dim
            
            # Normalize for cosine similarity
            embedding_array = np.array(embedding)
            norm = np.linalg.norm(embedding_array)
            if norm > 1e-9:
                embedding_array = embedding_array / norm
            
            # Ensure the dimension matches (embedding-001 is 768)
            actual_dim = len(embedding_array)
            if actual_dim != self.embedding_dim:
                self.embedding_dim = actual_dim
                logger.info(f"Updated embedding dimension to {actual_dim} based on model response")
            
            return embedding_array.tolist()
            
        except Exception as e:
            if "404" in str(e) and self.model_name != "embedding-001":
                logger.warning(f"⚠️ Gemini model {self.model_name} not found. Falling back to embedding-001")
                self.model_name = "embedding-001"
                return await self._encode_text(text, task_type)
            
            logger.warning(f"⚠️ Optional Gemini encoding failed: {e}")
            return [0.0] * self.embedding_dim
    
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
            if not embedding1 or not embedding2:
                return 0.5
            
            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)
            
            # Cosine similarity
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 < 1e-9 or norm2 < 1e-9:
                return 0.5
                
            similarity = np.dot(vec1, vec2) / (norm1 * norm2)
            
            # Convert to 0-1 range (from -1 to 1)
            similarity = (similarity + 1) / 2
            
            return float(similarity)
            
        except Exception as e:
            logger.warning(f"⚠️ Similarity calculation failed: {e}")
            return 0.5
    
    async def batch_encode(self, texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
        """
        Encode multiple texts in batch
        """
        if not self.is_loaded():
            return [[0.0] * self.embedding_dim] * len(texts)

        try:
            embeddings = []
            
            # Gemini API doesn't have native batch support, so we process sequentially
            for text in texts:
                embedding = await self._encode_text(text, task_type)
                embeddings.append(embedding)
            
            logger.debug(f"✅ Batch encoded {len(embeddings)} texts with Gemini")
            return embeddings
            
        except Exception as e:
            logger.warning(f"⚠️ Optional Gemini batch encoding skipped: {e}")
            return [[0.0] * self.embedding_dim] * len(texts)
