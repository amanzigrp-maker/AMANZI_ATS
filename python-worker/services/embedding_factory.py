"""
Embedding Service Factory
Returns the Gemini embedding service as the primary provider
"""
from typing import Union
from loguru import logger
from config import settings


def get_embedding_service() -> Union['GeminiEmbeddingService']:
    """
    Returns the Gemini embedding service.
    Local models (sentence-transformers) have been removed.
    """
    from services.gemini_embedding_service import GeminiEmbeddingService
    
    if not settings.gemini_api_key:
        logger.error("❌ GEMINI_API_KEY is missing! Semantic search will fail.")
    
    return GeminiEmbeddingService()
