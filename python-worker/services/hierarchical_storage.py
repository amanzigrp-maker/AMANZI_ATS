"""
Hierarchical Storage Service
Organizes uploaded resumes by Year/Month/Day/Hour structure
Example: storage/resumes/2025/06/23/12/resume.pdf
"""
import os
from datetime import datetime
from pathlib import Path
from typing import Tuple
from loguru import logger
import shutil


class HierarchicalStorage:
    """Organize files in Year/Month/Day/Hour directory structure"""
    
    def __init__(self, base_path: str = "storage/resumes"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def get_storage_path(self, upload_time: datetime = None) -> Path:
        """
        Get hierarchical storage path based on upload time
        
        Args:
            upload_time: Datetime of upload (defaults to now)
        
        Returns:
            Path object: storage/resumes/YYYY/MM/DD/HH/
        
        Example:
            2025-06-23 12:30:45 -> storage/resumes/2025/06/23/12/
        """
        if upload_time is None:
            upload_time = datetime.now()
        
        # Create hierarchical path: YYYY/MM/DD/HH
        year = upload_time.strftime("%Y")
        month = upload_time.strftime("%m")
        day = upload_time.strftime("%d")
        hour = upload_time.strftime("%H")
        
        storage_path = self.base_path / year / month / day / hour
        
        # Create directories if they don't exist
        storage_path.mkdir(parents=True, exist_ok=True)
        
        logger.debug(f"Storage path: {storage_path}")
        return storage_path
    
    def save_file(self, source_path: str, filename: str, upload_time: datetime = None) -> Tuple[str, str]:
        """
        Save file to hierarchical storage
        
        Args:
            source_path: Path to source file
            filename: Original filename
            upload_time: Upload datetime (defaults to now)
        
        Returns:
            Tuple of (full_path, relative_path)
        
        Example:
            Input: temp/resume.pdf, upload_time=2025-06-23 12:30
            Output: 
                - full_path: storage/resumes/2025/06/23/12/resume.pdf
                - relative_path: 2025/06/23/12/resume.pdf
        """
        if upload_time is None:
            upload_time = datetime.now()
        
        # Get storage directory
        storage_dir = self.get_storage_path(upload_time)
        
        # Handle duplicate filenames in same hour
        dest_path = storage_dir / filename
        if dest_path.exists():
            # Add timestamp suffix if file exists
            name, ext = os.path.splitext(filename)
            timestamp = upload_time.strftime("%H%M%S")
            filename = f"{name}_{timestamp}{ext}"
            dest_path = storage_dir / filename
        
        # Copy file to destination
        shutil.copy2(source_path, dest_path)
        
        # Calculate relative path from base
        relative_path = dest_path.relative_to(self.base_path)
        
        logger.info(f"✅ Saved file: {relative_path}")
        return str(dest_path), str(relative_path)
    
    def get_file_path(self, relative_path: str) -> Path:
        """
        Get full path from relative path
        
        Args:
            relative_path: Relative path (e.g., "2025/06/23/12/resume.pdf")
        
        Returns:
            Full Path object
        """
        return self.base_path / relative_path
    
    def list_files_in_hour(self, year: int, month: int, day: int, hour: int) -> list:
        """
        List all files uploaded in a specific hour
        
        Args:
            year: Year (e.g., 2025)
            month: Month (1-12)
            day: Day (1-31)
            hour: Hour (0-23)
        
        Returns:
            List of file paths
        """
        hour_path = self.base_path / f"{year:04d}" / f"{month:02d}" / f"{day:02d}" / f"{hour:02d}"
        
        if not hour_path.exists():
            return []
        
        return [str(f.relative_to(self.base_path)) for f in hour_path.iterdir() if f.is_file()]
    
    def get_statistics(self) -> dict:
        """Get storage statistics"""
        stats = {
            'total_files': 0,
            'total_size_mb': 0,
            'years': {}
        }
        
        for year_dir in self.base_path.iterdir():
            if not year_dir.is_dir():
                continue
            
            year = year_dir.name
            stats['years'][year] = {
                'months': {},
                'file_count': 0
            }
            
            for month_dir in year_dir.iterdir():
                if not month_dir.is_dir():
                    continue
                
                month = month_dir.name
                month_files = 0
                
                for day_dir in month_dir.iterdir():
                    if not day_dir.is_dir():
                        continue
                    
                    for hour_dir in day_dir.iterdir():
                        if not hour_dir.is_dir():
                            continue
                        
                        files = list(hour_dir.iterdir())
                        month_files += len(files)
                        
                        for f in files:
                            if f.is_file():
                                stats['total_files'] += 1
                                stats['total_size_mb'] += f.stat().st_size / 1024 / 1024
                
                stats['years'][year]['months'][month] = month_files
                stats['years'][year]['file_count'] += month_files
        
        return stats
    
    def cleanup_old_files(self, days_old: int = 365):
        """
        Clean up files older than specified days
        
        Args:
            days_old: Delete files older than this many days
        """
        cutoff_date = datetime.now().timestamp() - (days_old * 24 * 60 * 60)
        deleted_count = 0
        
        for year_dir in self.base_path.iterdir():
            if not year_dir.is_dir():
                continue
            
            for month_dir in year_dir.iterdir():
                if not month_dir.is_dir():
                    continue
                
                for day_dir in month_dir.iterdir():
                    if not day_dir.is_dir():
                        continue
                    
                    for hour_dir in day_dir.iterdir():
                        if not hour_dir.is_dir():
                            continue
                        
                        for file_path in hour_dir.iterdir():
                            if file_path.is_file():
                                if file_path.stat().st_mtime < cutoff_date:
                                    file_path.unlink()
                                    deleted_count += 1
                        
                        # Remove empty hour directory
                        if not list(hour_dir.iterdir()):
                            hour_dir.rmdir()
                    
                    # Remove empty day directory
                    if not list(day_dir.iterdir()):
                        day_dir.rmdir()
                
                # Remove empty month directory
                if not list(month_dir.iterdir()):
                    month_dir.rmdir()
            
            # Remove empty year directory
            if not list(year_dir.iterdir()):
                year_dir.rmdir()
        
        if deleted_count > 0:
            logger.info(f"🗑️ Cleaned up {deleted_count} old files")
        
        return deleted_count


# Example usage
if __name__ == "__main__":
    storage = HierarchicalStorage()
    
    # Example: Upload on 2025-06-23 at 12:30 PM
    upload_time = datetime(2025, 6, 23, 12, 30, 0)
    
    print(f"Storage path: {storage.get_storage_path(upload_time)}")
    # Output: storage/resumes/2025/06/23/12
    
    # Multiple uploads in same hour (12:00 - 12:59) go to same directory
    upload_time_1 = datetime(2025, 6, 23, 12, 15, 0)
    upload_time_2 = datetime(2025, 6, 23, 12, 45, 0)
    
    print(f"12:15 PM: {storage.get_storage_path(upload_time_1)}")
    print(f"12:45 PM: {storage.get_storage_path(upload_time_2)}")
    # Both output: storage/resumes/2025/06/23/12
    
    # List files in specific hour
    files = storage.list_files_in_hour(2025, 6, 23, 12)
    print(f"Files in hour: {files}")
