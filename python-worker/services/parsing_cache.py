"""
Resume Parsing Cache Service
Cache parsed results by file hash for instant duplicate processing
"""
import hashlib
import json
from typing import Dict, Any, Optional
from loguru import logger
from datetime import datetime, timedelta


class ParsingCache:
    """Cache parsed resume results for faster duplicate processing"""
    
    def __init__(self, ttl_hours: int = 24):
        self.cache = {}  # {file_hash: {result, timestamp}}
        self.ttl = timedelta(hours=ttl_hours)
        self.hits = 0
        self.misses = 0
    
    def get_file_hash(self, file_path: str) -> str:
        """Generate MD5 hash of file content"""
        try:
            with open(file_path, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception as e:
            logger.error(f"Failed to hash file: {e}")
            return None
    
    def get(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """Get cached parsing result"""
        if not file_hash:
            return None
        
        if file_hash in self.cache:
            cached = self.cache[file_hash]
            
            # Check if expired
            if datetime.now() - cached['timestamp'] > self.ttl:
                del self.cache[file_hash]
                self.misses += 1
                logger.debug(f"Cache expired for {file_hash[:8]}")
                return None
            
            self.hits += 1
            logger.info(f"✅ Cache HIT for {file_hash[:8]} (saved parsing time!)")
            return cached['result']
        
        self.misses += 1
        return None
    
    def set(self, file_hash: str, result: Dict[str, Any]):
        """Cache parsing result"""
        if not file_hash:
            return
        
        self.cache[file_hash] = {
            'result': result,
            'timestamp': datetime.now()
        }
        logger.debug(f"Cached result for {file_hash[:8]}")
    
    def clear_expired(self):
        """Remove expired cache entries"""
        now = datetime.now()
        expired = [
            hash_key for hash_key, cached in self.cache.items()
            if now - cached['timestamp'] > self.ttl
        ]
        
        for hash_key in expired:
            del self.cache[hash_key]
        
        if expired:
            logger.info(f"Cleared {len(expired)} expired cache entries")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0
        
        return {
            'size': len(self.cache),
            'hits': self.hits,
            'misses': self.misses,
            'hit_rate': f"{hit_rate:.1f}%",
            'memory_mb': len(json.dumps(self.cache)) / 1024 / 1024
        }
    
    def clear(self):
        """Clear all cache"""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
        logger.info("Cache cleared")


# Global cache instance
parsing_cache = ParsingCache(ttl_hours=24)
