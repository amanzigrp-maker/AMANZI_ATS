"""
Embedding Service Factory
Returns the appropriate embedding service based on configuration
"""
from typing import Union
from loguru import logger
from config import settings


def get_embedding_service() -> Union['EmbeddingService', 'GeminiEmbeddingService']:
    """
    Returns the configured embedding service based on EMBEDDING_PROVIDER
    
    Returns:
        EmbeddingService or GeminiEmbeddingService instance
        
    Raises:
        ValueError: If unknown provider is specified
        RuntimeError: If required configuration is missing
    """
    provider = getattr(settings, "embedding_provider", "sentence-transformers").lower()
    
    if provider == "gemini":
        from services.gemini_embedding_service import GeminiEmbeddingService
        
        if not settings.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini. "
                "Please set GEMINI_API_KEY in your .env file."
            )
        
        return GeminiEmbeddingService()
        
    elif provider == "sentence-transformers":
        from services.embedding_service import EmbeddingService
        
        return EmbeddingService()
        
    else:
        raise ValueError(
            f"Unknown embedding provider: '{provider}'. "
            f"Valid options: 'sentence-transformers', 'gemini'"
        )
