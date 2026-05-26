# Python Worker Installation Guide

## Quick Installation

Install all dependencies with a single command:

```bash
pip install -r requirements.txt
```

## Complete Dependency List

### Core Framework
- **FastAPI** (0.104.1) - Modern web framework for building APIs
- **Uvicorn** (0.24.0) - ASGI server for FastAPI
- **Pydantic** (2.12.5) - Data validation using Python type annotations
- **Pydantic Settings** (2.1.0) - Settings management
- **Python Multipart** (0.0.6) - Multipart form data parsing

### Document Processing
- **PyMuPDF** (1.26.7) - PDF text extraction
- **python-docx** (0.8.11) - DOCX file processing
- **Pillow** (10.4.0) - Image processing library
- **rapidfuzz** (3.14.3) - Fast fuzzy string matching for deduplication

### Database
- **psycopg2-binary** (2.9.9) - PostgreSQL adapter (synchronous)
- **asyncpg** (0.29.0) - PostgreSQL adapter (asynchronous)

### AI & Machine Learning
- **google-generativeai** (0.8.3) - Gemini API for LLM parsing and embeddings
- **numpy** (1.24.3) - Numerical computing for embeddings and calculations

### Data Processing
- **pandas** (2.1.3) - Data manipulation and analysis
- **openpyxl** (3.1.2) - Excel XLSX file reading/writing
- **xlrd** (2.0.1) - Excel XLS file reading

### Message Queue (Optional)
- **pika** (1.3.2) - RabbitMQ client
- **celery** (5.3.4) - Distributed task queue
- **redis** (5.0.1) - Redis client for caching

### Object Storage (Optional)
- **minio** (7.2.0) - MinIO client for object storage
- **boto3** (1.29.7) - AWS S3 client

### Utilities
- **python-dotenv** (1.0.0) - Environment variable management
- **requests** (2.31.0) - HTTP library
- **aiofiles** (23.2.1) - Async file operations
- **loguru** (0.7.2) - Advanced logging

### Monitoring
- **prometheus-client** (0.19.0) - Prometheus metrics

### Testing
- **pytest** (7.4.3) - Testing framework
- **pytest-asyncio** (0.21.1) - Async test support
- **httpx** (0.25.2) - Async HTTP client for testing

## What's NOT Included (Intentionally Removed)

The following dependencies were removed to reduce installation size and complexity:

- ❌ **pytesseract** - OCR functionality (replaced by Gemini LLM)
- ❌ **opencv-python** - Computer vision (not needed with Gemini)
- ❌ **torch** - PyTorch (replaced by Gemini API)
- ❌ **sentence-transformers** - Local embeddings (using Gemini embeddings API)
- ❌ **scikit-learn** - Machine learning (using Gemini for intelligent matching)

## System Requirements

### Python Version
- Python 3.9 or higher recommended
- Python 3.11 tested and working

### Operating System
- ✅ Windows (tested)
- ✅ Linux (production ready)
- ✅ macOS (should work)

### External Dependencies
- PostgreSQL 12+ with pgvector extension
- Redis (optional, for caching)
- RabbitMQ (optional, for message queue)

## Installation Steps

### 1. Create Virtual Environment (Recommended)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Database
DB_HOST=localhost
DB_PORT=5433
DB_NAME=ats_db
DB_USER=your_user
DB_PASSWORD=your_password

# Gemini API
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash

# Storage
STORAGE_PATH=./storage

# Redis (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=false

# API
WORKER_API_PORT=8001
WORKER_API_HOST=127.0.0.1

# Logging
LOG_LEVEL=INFO
```

### 4. Run the Worker

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

## Troubleshooting

### Common Issues

#### 1. PyMuPDF Installation Fails
```bash
# Try upgrading pip first
pip install --upgrade pip
pip install PyMuPDF==1.26.7
```

#### 2. psycopg2-binary Installation Fails
```bash
# On Windows, you may need Visual C++ Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/

# Alternative: Use conda
conda install psycopg2
```

#### 3. Import Errors
```bash
# Ensure virtual environment is activated
# Reinstall all dependencies
pip install --force-reinstall -r requirements.txt
```

#### 4. Database Connection Issues
- Verify PostgreSQL is running
- Check DB credentials in .env file
- Ensure pgvector extension is installed:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

## Verification

Test your installation:

```bash
# Check if all imports work
python -c "import fastapi, uvicorn, PyMuPDF, docx, google.generativeai; print('✅ All core dependencies installed')"

# Run health check
curl http://localhost:8001/health
```

## Production Deployment

For production, consider:

1. **Use gunicorn with uvicorn workers:**
   ```bash
   gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8001
   ```

2. **Set up systemd service** (Linux)
3. **Use Docker** for containerization
4. **Configure reverse proxy** (nginx/Apache)
5. **Enable monitoring** with Prometheus

## Support

For issues or questions:
- Check logs in `logs/worker.log`
- Review error messages in console
- Verify all environment variables are set correctly

## License

This project uses various open-source dependencies. Please review individual package licenses for compliance.
