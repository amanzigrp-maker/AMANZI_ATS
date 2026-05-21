"""
Configuration management for the Python worker service
Supports both Windows development and Linux production deployment
"""
import os
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

# Load environment variables from repo root .env
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Detect platform
IS_WINDOWS = sys.platform == 'win32'

def build_database_url() -> str:
    """Build DATABASE_URL from DB_* variables without embedding credentials in source."""
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit

    required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise ValueError(f"Missing required database env vars for Python worker: {', '.join(missing)}")

    user = quote_plus(os.environ["DB_USER"])
    password = quote_plus(os.environ["DB_PASSWORD"])
    host = os.environ["DB_HOST"]
    port = os.environ["DB_PORT"]
    database = os.environ["DB_NAME"]
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"

class Settings(BaseSettings):
    """Application settings"""
    
    # pydantic-settings v2 configuration
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)
    
    # Database
    database_url: str = build_database_url()
    
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
    
    # Gemini AI Configuration
    gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    
    # Processing
    max_workers: int = int(os.getenv("MAX_WORKERS", "4"))
    batch_size: int = int(os.getenv("BATCH_SIZE", "10"))
    max_file_size_mb: int = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
    
    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_file: str = os.getenv("LOG_FILE", "logs/worker.log")
    
    # API
    worker_api_port: int = int(os.getenv("WORKER_API_PORT", "8001"))
    worker_api_host: str = os.getenv("WORKER_API_HOST", "127.0.0.1")

# Global settings instance
settings = Settings()

# Create necessary directories
try:
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    settings.temp_path.mkdir(parents=True, exist_ok=True)
    Path("logs").mkdir(exist_ok=True)
except Exception as e:
    print(f"⚠️ Warning: Could not create some directories: {e}")
