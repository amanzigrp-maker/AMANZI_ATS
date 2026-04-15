"""
Local File Storage Service (ATS-SAFE VERSION)

Rules:
- Python NEVER decides filenames
- Python NEVER renames files
- Filenames come from Node.js (candidate_code.ext)
- Always returns ABSOLUTE paths
"""

import os
from pathlib import Path
from loguru import logger
from typing import Optional
from config import settings


class LocalStorageService:
    """Local filesystem storage service (Node.js is source of truth)."""

    def __init__(self):
        self.storage_path: Path = settings.storage_path  # absolute
        self.upload_path: Path = settings.upload_path
        self.temp_path: Path = settings.temp_path

    async def initialize(self):
        """Create required folders."""
        try:
            self.storage_path.mkdir(parents=True, exist_ok=True)
            self.upload_path.mkdir(parents=True, exist_ok=True)
            self.temp_path.mkdir(parents=True, exist_ok=True)

            os.chmod(self.storage_path, 0o755)
            os.chmod(self.upload_path, 0o755)
            os.chmod(self.temp_path, 0o755)

            logger.info(f"✅ Local storage initialized at: {self.storage_path}")
        except Exception as e:
            logger.error(f"❌ Failed initializing local storage: {e}")
            raise

    # ------------------------------------------------------------------
    # UPLOAD (NO RENAMING, NO UUIDs)
    # ------------------------------------------------------------------
    async def upload_file(
        self,
        content: bytes,
        filename: str,
        folder: str = "resumes"
    ) -> str:
        """
        Store file EXACTLY with the given filename.
        Filename must already be ATS-safe (candidate_code.ext).
        Returns ABSOLUTE path.
        """
        try:
            if not filename:
                raise ValueError("Filename must be provided")

            folder_path = self.storage_path / folder
            folder_path.mkdir(parents=True, exist_ok=True)

            final_path = folder_path / filename

            with open(final_path, "wb") as f:
                f.write(content)

            abs_path = str(final_path)
            logger.info(f"📁 Stored file at ABSOLUTE PATH: {abs_path}")

            return abs_path

        except Exception as e:
            logger.error(f"❌ Upload error for {filename}: {e}")
            raise

    # ------------------------------------------------------------------
    # RENAME (DISABLED — Node.js OWNS FILENAMES)
    # ------------------------------------------------------------------
    async def rename_file(self, old_full_path: str, new_filename: str) -> str:
        """
        ❌ Disabled intentionally.
        Node.js controls filenames.
        """
        logger.warning(
            "⚠️ rename_file() called but is disabled. "
            "Node.js controls filenames in ATS."
        )
        return old_full_path

    # ------------------------------------------------------------------
    async def download_file(self, full_path: str) -> bytes:
        """Return file contents."""
        fp = Path(full_path)
        if not fp.exists():
            raise FileNotFoundError(full_path)

        with open(fp, "rb") as f:
            return f.read()

    # ------------------------------------------------------------------
    async def delete_file(self, full_path: str) -> bool:
        try:
            fp = Path(full_path)
            if fp.exists():
                fp.unlink()
                logger.info(f"🗑️ Deleted file: {full_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"❌ Delete failed: {e}")
            return False

    # ------------------------------------------------------------------
    async def file_exists(self, full_path: str) -> bool:
        return Path(full_path).exists()

    # ------------------------------------------------------------------
    async def get_file_info(self, full_path: str) -> Optional[dict]:
        fp = Path(full_path)
        if not fp.exists():
            return None

        stat = fp.stat()
        return {
            "path": full_path,
            "size": stat.st_size,
            "created": stat.st_ctime,
            "modified": stat.st_mtime,
            "is_file": fp.is_file(),
        }

    # ------------------------------------------------------------------
    async def list_files(self, folder: str = "", pattern: str = "*") -> list:
        search_path = self.storage_path / folder
        if not search_path.exists():
            return []
        return [str(p) for p in search_path.glob(pattern) if p.is_file()]

    # ------------------------------------------------------------------
    async def create_temp_file(self, content: bytes, suffix: str = "") -> str:
        temp_name = f"tmp{suffix}"
        temp_path = self.temp_path / temp_name
        with open(temp_path, "wb") as f:
            f.write(content)
        return str(temp_path)

    # ------------------------------------------------------------------
    async def cleanup_temp_files(self, max_age_hours: int = 24):
        import time
        now = time.time()
        for file in self.temp_path.glob("*"):
            if now - file.stat().st_mtime > max_age_hours * 3600:
                file.unlink(missing_ok=True)

    # ------------------------------------------------------------------
    async def check_connection(self) -> bool:
        try:
            test_path = self.temp_path / "test.tmp"
            with open(test_path, "wb") as f:
                f.write(b"ok")
            ok = test_path.exists()
            test_path.unlink()
            return ok
        except:
            return False
