"""
Configuration management for the Python worker service
Supports both Windows development and Linux production deployment
"""
import os
import sys
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

# Load environment variables from repo root .env
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Detect platform
IS_WINDOWS = sys.platform == 'win32'

class Settings(BaseSettings):
    """Application settings"""
    
    # pydantic-settings v2 configuration
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)
    
    # Database - Use Windows-compatible defaults for development
    database_url: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://postgres:sagar123@localhost:5432/amanzi_data" if IS_WINDOWS 
        else "postgresql://ats_user:ats_secure_password_2024@localhost:5432/amanzi_data"
    )
    
    # File Storage - Windows-compatible paths for development
    storage_base: Path = Path(os.getenv("STORAGE_PATH", 
        "./storage" if IS_WINDOWS else "/opt/ats/storage"
    ))
    storage_path: Path = storage_base
    upload_path: Path = storage_base / "resumes"
    temp_path: Path = storage_base / "temp"
    
    # Redis (optional - can be disabled for simpler deployment)
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))
    redis_db: int = int(os.getenv("REDIS_DB", "0"))
    redis_enabled: bool = os.getenv("REDIS_ENABLED", "false" if IS_WINDOWS else "true").lower() == "true"
    
    # ML Models
    embedding_provider: str = os.getenv("EMBEDDING_PROVIDER", "sentence-transformers")
    # Options: "sentence-transformers" (default, local, free) or "gemini" (cloud, requires API key)
    
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    ml_model_cache_dir: Path = Path(os.getenv("MODEL_CACHE_DIR", "./models"))
    
    # Gemini Embeddings (only used if embedding_provider=gemini)
    gemini_embedding_model: str = os.getenv("GEMINI_EMBEDDING_MODEL", "text-embedding-004")
    
    # Processing
    max_workers: int = int(os.getenv("MAX_WORKERS", "4"))
    batch_size: int = int(os.getenv("BATCH_SIZE", "10"))
    max_file_size_mb: int = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
    
    # Tesseract OCR
    tesseract_cmd: Optional[str] = os.getenv("TESSERACT_CMD")
    
    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_file: str = os.getenv("LOG_FILE", "logs/worker.log")
    
    # API
    worker_api_port: int = int(os.getenv("WORKER_API_PORT", "8001"))
    worker_api_host: str = os.getenv("WORKER_API_HOST", "127.0.0.1")

    # Gemini (optional)
    gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

   

# Global settings instance
settings = Settings()

# Create necessary directories (works on both Windows and Linux)
try:
    settings.ml_model_cache_dir.mkdir(parents=True, exist_ok=True)
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    settings.temp_path.mkdir(parents=True, exist_ok=True)
    Path("logs").mkdir(exist_ok=True)
    print(f"✅ Storage directories created: {settings.storage_path}")
except Exception as e:
    print(f"⚠️ Warning: Could not create some directories: {e}")
