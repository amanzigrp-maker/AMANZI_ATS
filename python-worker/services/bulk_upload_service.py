"""
Bulk Resume Upload Service
Handles parallel processing of multiple resumes with progress tracking
Uses Advanced Hybrid Parser (Regex + SpaCy + Qwen AI)
"""

import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
from loguru import logger

from services.advanced_hybrid_parser import AdvancedHybridParser
from services.duplicate_checker import DuplicateChecker
from database.db import Database


class BulkUploadService:
    """Service for handling bulk resume uploads with parallel processing"""
    
    def __init__(self, max_workers: int = 5):
        self.max_workers = max_workers
        self.parser = AdvancedHybridParser()
        self.db = Database()
        self.duplicate_checker = DuplicateChecker(self.db)

    async def initialize(self):
        """Initialize parser models and DB"""
        await self.parser.load_models()
        await self.db.connect()

    # -------------------------------------------------------
    # Directory and Job Setup
    # -------------------------------------------------------
    def create_time_based_directory(self, base_path: str = "storage/resumes") -> str:
        """Create time-based directory structure: YYYY/MM/DD/HH"""
        now = datetime.now()
        directory = os.path.join(base_path, f"{now:%Y/%m/%d/%H}")
        os.makedirs(directory, exist_ok=True)
        logger.info(f"📁 Created directory: {directory}")
        return directory

    async def create_bulk_job(self, user_id: int, total_files: int, upload_dir: str) -> int:
        """Create a bulk upload job record"""
        query = """
            INSERT INTO bulk_upload_jobs (user_id, job_status, total_files, upload_directory)
            VALUES (%s, %s, %s, %s)
            RETURNING job_id
        """
        job_id = await self.db._run_sync(
            self.db._fetchval_sync,
            query,
            (user_id, 'processing', total_files, upload_dir),
        )
        logger.info(f"📋 Created bulk job {job_id} for {total_files} files (user: {user_id})")
        return int(job_id)

    async def update_job_progress(self, job_id: int, processed: int, successful: int, failed: int):
        """Update job progress"""
        query = """
            UPDATE bulk_upload_jobs 
            SET processed_files = %s, successful_files = %s, failed_files = %s
            WHERE job_id = %s
        """
        await self.db._run_sync(
            self.db._execute_sync,
            query,
            (processed, successful, failed, job_id),
        )

    async def complete_job(self, job_id: int, status: str = 'completed'):
        """Mark job as completed"""
        query = """
            UPDATE bulk_upload_jobs 
            SET job_status = %s, completed_at = CURRENT_TIMESTAMP
            WHERE job_id = %s
        """
        await self.db._run_sync(
            self.db._execute_sync,
            query,
            (status, job_id),
        )
        logger.info(f"✅ Bulk job {job_id} completed with status: {status}")

    async def create_file_record(self, job_id: int, file_name: str, file_path: str, file_size: int) -> int:
        """Create a record for an uploaded file"""
        query = """
            INSERT INTO bulk_upload_files (job_id, file_name, file_path, file_size, file_status)
            VALUES (%s, %s, %s, %s, 'pending')
            RETURNING file_id
        """
        file_id = await self.db._run_sync(
            self.db._fetchval_sync,
            query,
            (job_id, file_name, file_path, file_size),
        )
        return int(file_id)

    async def update_file_status(self, file_id: int, status: str, resume_id: int = None, error: str = None):
        """Update file processing status"""
        query = """
            UPDATE bulk_upload_files 
            SET file_status = %s, resume_id = %s, error_message = %s, processed_at = CURRENT_TIMESTAMP
            WHERE file_id = %s
        """
        await self.db._run_sync(
            self.db._execute_sync,
            query,
            (status, resume_id, error, file_id),
        )

    # -------------------------------------------------------
    # Core File Processing Logic
    # -------------------------------------------------------
    async def process_single_file(
        self,
        file_id: int,
        file_path: str,
        filename: str,
        job_id: int,
        linked_job_id: int | None = None,
        uploaded_by_user_id: int | None = None,
    ) -> Dict[str, Any]:
        """Process a single resume file using Advanced Hybrid Parser"""
        try:
            logger.info(f"📄 Processing file: {filename} (file_id: {file_id})")

            # Parse with Advanced Hybrid Parser
            parsed_data = await self.parser.parse_file(file_path, filename)

            # Normalize tuple/dict result
            if isinstance(parsed_data, tuple):
                # assume (status, data) or (True, dict)
                parsed_data = parsed_data[-1]

            if not isinstance(parsed_data, dict):
                raise TypeError(f"Unexpected parser output type: {type(parsed_data)}")

            sources = parsed_data.get('extraction_sources', {})
            logger.info(
                f"   Extraction sources: Regex={sources.get('regex')}, "
                f"Qwen={sources.get('qwen')}"
            )

            email = parsed_data.get('email')
            phone = parsed_data.get('phone')

            # Duplicate check
            if email or phone:
                result = await self.duplicate_checker.check_duplicate(email, phone)
                if isinstance(result, tuple):
                    is_duplicate, existing_candidate = result
                else:
                    is_duplicate, existing_candidate = False, None

                if is_duplicate and existing_candidate:
                    duplicate_name = existing_candidate.get('full_name', 'Unknown')
                    await self.update_file_status(file_id, 'duplicate', None, f"Duplicate: {duplicate_name}")
                    logger.warning(f"🚫 Duplicate detected: {filename}")
                    return {'status': 'duplicate', 'file_id': file_id, 'filename': filename}

            # Store in DB with original filename
            file_size = os.path.getsize(file_path)
            resume_id = await self.db.create_resume_record(filename, file_path, file_size)
            candidate_id = await self.db.store_parsed_resume_data(resume_id, parsed_data)

            # ------------------------------------------------------------------
            # Rename physical file to CANDIDATEID_CANDIDATE_NAME.ext
            # Example: AT100042_PRITHVI_BISHT.pdf
            # ------------------------------------------------------------------
            try:
                if candidate_id:
                    # Candidate code like AT100042 comes from DB, fall back to numeric id
                    candidate_code = None
                    try:
                        # Prefer candidate_code if available from parsed_data or duplicate checker
                        candidate_code = parsed_data.get('candidate_code')
                    except Exception:
                        candidate_code = None

                    if not candidate_code:
                        # If no explicit code, build from numeric id
                        candidate_code = f"AT{int(candidate_id):06d}" if isinstance(candidate_id, int) else str(candidate_id)

                    full_name = (parsed_data.get('full_name') or '').strip() or 'CANDIDATE'
                    safe_name = (
                        full_name.upper()
                        .replace(' ', '_')
                        .replace('\t', '_')
                        .replace('\n', '_')
                    )

                    base, ext = os.path.splitext(file_path)
                    new_filename = f"{candidate_code}_{safe_name}{ext}"

                    # new path in same folder
                    new_file_path = os.path.join(os.path.dirname(file_path), new_filename)

                    if not os.path.exists(new_file_path):
                        os.rename(file_path, new_file_path)
                        file_path = new_file_path

                        # Update DB record with new file path & filename
                        await self.db.update_resume_file_path(resume_id, new_filename, new_file_path)
                        filename = new_filename
                        logger.info(f"📝 Renamed resume file to {new_filename} for candidate {candidate_id}")
            except Exception as rename_err:
                logger.error(f"⚠️ Failed to rename resume file for candidate {candidate_id}: {rename_err}")

            # If this bulk upload is associated with a specific ATS job,
            # create an application record linking the candidate to that job
            # and record which user uploaded/shared the resume.
            if linked_job_id and candidate_id:
                try:
                    await self.db.create_job_application(
                        job_id=linked_job_id,
                        candidate_id=candidate_id,
                        uploaded_by_user_id=uploaded_by_user_id,
                    )
                except Exception as app_err:
                    logger.error(f"⚠️ Failed to create job application for candidate {candidate_id}: {app_err}")

            await self.update_file_status(file_id, 'completed', resume_id)

            logger.info(f"✅ Processed: {filename} (resume_id={resume_id})")
            logger.info(f"   Extracted: Name={parsed_data.get('full_name')}, Email={email}")

            return {
                'status': 'completed',
                'file_id': file_id,
                'filename': filename,
                'resume_id': resume_id,
                'candidate_id': candidate_id
            }

        except Exception as e:
            error_msg = str(e)
            await self.update_file_status(file_id, 'failed', None, error_msg)
            logger.error(f"❌ Failed to process {filename}: {error_msg}")
            return {'status': 'failed', 'file_id': file_id, 'filename': filename, 'error': error_msg}

    # -------------------------------------------------------
    # Bulk Upload Handler
    # -------------------------------------------------------
    async def process_bulk_upload(
        self,
        files: List[Dict[str, Any]],
        user_id: int,
        job_id: int | None = None,
    ) -> Dict[str, Any]:
        """Process multiple resumes in parallel using the Advanced Hybrid Parser.

        `job_id` (if provided) refers to the ATS job_openings.job_id that
        parsed candidates should be linked to as applications.
        A separate internal bulk upload job id is always created for tracking
        progress in the bulk_upload_jobs table.
        """
        try:
            upload_dir = self.create_time_based_directory()

            # Internal bulk upload tracking id
            bulk_job_id = await self.create_bulk_job(user_id, len(files), upload_dir)

            file_records = []
            for file_data in files:
                filename = file_data['filename']
                content = file_data['content']
                file_size = file_data['size']

                file_path = os.path.join(upload_dir, filename)
                with open(file_path, 'wb') as f:
                    f.write(content)

                file_id = await self.create_file_record(bulk_job_id, filename, file_path, file_size)
                file_records.append({'file_id': file_id, 'file_path': file_path, 'filename': filename})

            logger.info(f"📦 Saved {len(file_records)} files, starting parallel processing...")
            logger.info(f"🚀 Using Advanced Hybrid Parser with {self.max_workers} workers")

            processed = successful = failed = duplicates = 0
            results = []

            # Pass the real ATS job_id (if any) as linked_job_id so
            # applications are created against job_openings.job_id, not the
            # internal bulk upload job id.
            linked_job_id = job_id

            tasks = [
                asyncio.create_task(
                    self.process_single_file(
                        r['file_id'],
                        r['file_path'],
                        r['filename'],
                        bulk_job_id,
                        linked_job_id=linked_job_id,
                        uploaded_by_user_id=user_id,
                    )
                )
                for r in file_records
            ]

            for task in asyncio.as_completed(tasks):
                result = await task
                results.append(result)
                processed += 1

                status = result.get('status')
                if status == 'completed':
                    successful += 1
                elif status == 'duplicate':
                    duplicates += 1
                else:
                    failed += 1

                await self.update_job_progress(bulk_job_id, processed, successful, failed)
                logger.info(f"📊 Progress: {processed}/{len(files)} "
                            f"({successful} success, {failed} failed, {duplicates} duplicates)")

            await self.complete_job(bulk_job_id, 'completed')

            logger.info(f"🎉 Bulk upload job {bulk_job_id} completed!")
            logger.info(f"   Total: {len(files)}, Success: {successful}, Failed: {failed}, Duplicates: {duplicates}")

            return {
                'job_id': bulk_job_id,
                'total_files': len(files),
                'processed': processed,
                'successful': successful,
                'failed': failed,
                'duplicates': duplicates,
                'upload_directory': upload_dir,
                'results': results
            }

        except Exception as e:
            logger.error(f"❌ Bulk upload failed: {e}")
            if 'bulk_job_id' in locals():
                await self.complete_job(bulk_job_id, 'failed')
            raise
