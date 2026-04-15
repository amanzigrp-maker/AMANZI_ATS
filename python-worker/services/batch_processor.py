"""
Batch Resume Processing Service
Process multiple resumes in parallel for 3x faster batch uploads
"""
import asyncio
from typing import List, Dict, Any
from loguru import logger
from concurrent.futures import ThreadPoolExecutor
import time


class BatchProcessor:
    """Process multiple resumes in parallel"""
    
    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
    
    async def process_batch(self, parser, files: List[tuple]) -> List[Dict[str, Any]]:
        """
        Process multiple resumes in parallel
        
        Args:
            parser: HybridResumeParser instance
            files: List of (file_path, filename) tuples
        
        Returns:
            List of parsed results
        """
        start_time = time.time()
        logger.info(f"📦 Processing batch of {len(files)} resumes in parallel...")
        
        # Create tasks for all files
        tasks = [
            self._process_single(parser, file_path, filename)
            for file_path, filename in files
        ]
        
        # Process all in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Separate successes and failures
        successes = []
        failures = []
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                failures.append({
                    'filename': files[i][1],
                    'error': str(result)
                })
            else:
                successes.append(result)
        
        elapsed = time.time() - start_time
        logger.info(f"✅ Batch processing complete: {len(successes)} success, {len(failures)} failed in {elapsed:.2f}s")
        logger.info(f"   Average: {elapsed/len(files):.2f}s per resume")
        
        return {
            'successes': successes,
            'failures': failures,
            'total': len(files),
            'success_count': len(successes),
            'failure_count': len(failures),
            'elapsed_time': elapsed
        }
    
    async def _process_single(self, parser, file_path: str, filename: str) -> Dict[str, Any]:
        """Process a single resume"""
        try:
            result = await parser.parse_file(file_path, filename)
            return result
        except Exception as e:
            logger.error(f"Failed to process {filename}: {e}")
            raise
    
    def shutdown(self):
        """Shutdown the executor"""
        self.executor.shutdown(wait=True)
