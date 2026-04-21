"""
Embedding Service
Generates vector embeddings using sentence-transformers (BGE model)
"""
import numpy as np
try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None
    nn = None

from typing import Dict, Any, List
from loguru import logger
from config import settings
import os

# Disable Hugging Face hub and transformers progress bars
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TRANSFORMERS_NO_ADVISORY_WARNINGS"] = "1"

class EmbeddingService:
    """Generate vector embeddings for semantic search"""
    
    def __init__(self):
        self.model = None
        self.model_name = getattr(settings, "embedding_model", "")
        self.device = "cpu"
        self.embedding_dim: int | None = None

    async def load_models(self):
        """Load embedding model"""
        logger.info("🔌 Detecting computation device...")
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
                logger.info("✅ CUDA detected! Using GPU for embeddings.")
            else:
                self.device = "cpu"
                logger.info("ℹ️ CUDA not available. Using CPU.")
        except Exception as e:
            self.device = "cpu"
            logger.warning(f"⚠️ Torch unavailable/incompatible: {e}. Using CPU.")

        logger.info(f"🧠 Loading embedding model: {self.model_name}...")
        try:
            from sentence_transformers import SentenceTransformer
            
            # Try loading with local_files_only first (offline mode)
            try:
                logger.info("  -> Attempting offline load from cache...")
                self.model = SentenceTransformer(
                    self.model_name,
                    cache_folder=str(settings.ml_model_cache_dir),
                    device=self.device,
                    local_files_only=True  # Work offline
                )
                logger.success("  -> Offline load successful")
            except Exception as e:
                # Fallback to online mode if cache doesn't exist
                logger.info(f"  -> Cache empty or error: {e}. Falling back to online mode...")
                self.model = SentenceTransformer(
                    self.model_name,
                    cache_folder=str(settings.ml_model_cache_dir),
                    device=self.device
                )
                logger.success("  -> Online load successful")

            try:
                self.embedding_dim = int(self.model.get_sentence_embedding_dimension())
                logger.info(f"  -> Model dimension: {self.embedding_dim}")
            except Exception:
                self.embedding_dim = None
            
            logger.success(f"✅ Embedding model '{self.model_name}' ready")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            logger.warning("⚠️ Working without embeddings - semantic search will not work")
            logger.warning("Resume parsing will still work!")
            self.model = None
            self.embedding_dim = None
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None
    
    async def generate_embeddings(self, resume_data: Dict[str, Any]) -> Dict[str, List[float]]:
        """
        Generate vector embeddings for different sections of the resume
        
        Args:
            resume_data: Parsed resume data with text content
            
        Returns:
            Dictionary with embeddings for different sections
        """
        try:
            if not self.model:
                raise RuntimeError("Model not loaded. Call load_models() first.")
            
            embeddings = {}
            
            # Full resume embedding
            full_text = resume_data.get('raw_text', '')
            if full_text:
                embeddings['full_resume_embedding'] = await self._encode_text(full_text)
            
            # Skills embedding
            skills = resume_data.get('skills', [])
            if skills:
                skills_text = ', '.join(skills)
                embeddings['skills_embedding'] = await self._encode_text(skills_text)
            
            # Experience embedding
            experiences = resume_data.get('experience', [])
            if experiences:
                exp_text = ' '.join([exp.get('description', '') for exp in experiences])
                if exp_text:
                    embeddings['experience_embedding'] = await self._encode_text(exp_text)
            
            # Education embedding
            education = resume_data.get('education', [])
            if education:
                edu_text = ' '.join([edu.get('description', '') for edu in education])
                if edu_text:
                    embeddings['education_embedding'] = await self._encode_text(edu_text)
            
            logger.info(f"✅ Generated {len(embeddings)} embeddings")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
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
            
            # Job description embedding
            if job_description:
                embeddings['job_description_embedding'] = await self._encode_text(job_description)
            
            # Required skills embedding
            if required_skills:
                skills_text = ', '.join(required_skills)
                embeddings['required_skills_embedding'] = await self._encode_text(skills_text)
            
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating job embeddings: {e}")
            raise
    
    async def _encode_text(self, text: str) -> List[float]:
        """
        Encode text into vector embedding
        
        Args:
            text: Input text
            
        Returns:
            List of floats representing the embedding vector
        """
        try:
            # Truncate if too long (BGE has 512 token limit)
            if len(text) > 5000:
                text = text[:5000]
            
            # Generate embedding
            embedding = self.model.encode(
                text,
                convert_to_numpy=True,
                normalize_embeddings=True,  # L2 normalization for cosine similarity
                show_progress_bar=False
            )
            
            # Convert to list for JSON serialization
            return embedding.tolist()
            
        except Exception as e:
            logger.error(f"Error encoding text: {e}")
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
    
    async def batch_encode(self, texts: List[str]) -> List[List[float]]:
        """
        Encode multiple texts in batch for efficiency
        
        Args:
            texts: List of text strings
            
        Returns:
            List of embedding vectors
        """
        try:
            embeddings = self.model.encode(
                texts,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
                batch_size=settings.batch_size
            )
            
            return [emb.tolist() for emb in embeddings]
            
        except Exception as e:
            logger.error(f"Error in batch encoding: {e}")
            raise
