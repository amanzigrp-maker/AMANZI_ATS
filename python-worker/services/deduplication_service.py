"""
Candidate Deduplication Service
Uses fuzzy matching to detect duplicate candidates
"""
from typing import List, Dict, Any, Optional, Tuple
from rapidfuzz import fuzz, process
from loguru import logger
import re


class DeduplicationService:
    """Detect and merge duplicate candidates"""
    
    def __init__(self):
        self.email_similarity_threshold = 90  # High threshold for email
        self.name_similarity_threshold = 85   # Medium threshold for name
        self.phone_similarity_threshold = 95  # High threshold for phone
        self.combined_threshold = 80          # Overall match threshold
    
    def find_duplicates(
        self, 
        candidate: Dict[str, Any], 
        existing_candidates: List[Dict[str, Any]]
    ) -> List[Tuple[Dict[str, Any], float]]:
        """
        Find potential duplicate candidates
        Returns list of (candidate, similarity_score) tuples
        """
        duplicates = []
        
        for existing in existing_candidates:
            score = self.calculate_similarity(candidate, existing)
            
            if score >= self.combined_threshold:
                duplicates.append((existing, score))
                logger.info(f"Potential duplicate found: {existing.get('full_name')} (score: {score:.2f})")
        
        # Sort by similarity score (highest first)
        duplicates.sort(key=lambda x: x[1], reverse=True)
        
        return duplicates
    
    def calculate_similarity(
        self, 
        candidate1: Dict[str, Any], 
        candidate2: Dict[str, Any]
    ) -> float:
        """
        Calculate overall similarity between two candidates
        Returns score 0-100
        """
        scores = []
        weights = []
        
        # 1. Email comparison (highest weight)
        email1 = self._normalize_email(candidate1.get('email', ''))
        email2 = self._normalize_email(candidate2.get('email', ''))
        
        if email1 and email2:
            email_score = fuzz.ratio(email1, email2)
            scores.append(email_score)
            weights.append(0.4)  # 40% weight
            
            # Exact email match = very high confidence
            if email1 == email2:
                return 100.0
        
        # 2. Phone comparison (high weight)
        phone1 = self._normalize_phone(candidate1.get('phone', ''))
        phone2 = self._normalize_phone(candidate2.get('phone', ''))
        
        if phone1 and phone2:
            phone_score = fuzz.ratio(phone1, phone2)
            scores.append(phone_score)
            weights.append(0.3)  # 30% weight
            
            # Exact phone match = high confidence
            if phone1 == phone2:
                return 95.0
        
        # 3. Name comparison (medium weight)
        name1 = self._normalize_name(candidate1.get('full_name', ''))
        name2 = self._normalize_name(candidate2.get('full_name', ''))
        
        if name1 and name2:
            # Use token sort ratio for name (handles word order)
            name_score = fuzz.token_sort_ratio(name1, name2)
            scores.append(name_score)
            weights.append(0.2)  # 20% weight
        
        # 4. Skills comparison (low weight)
        skills1 = set(self._normalize_skills(candidate1.get('primary_skills', [])))
        skills2 = set(self._normalize_skills(candidate2.get('primary_skills', [])))
        
        if skills1 and skills2:
            # Jaccard similarity for skills
            intersection = len(skills1.intersection(skills2))
            union = len(skills1.union(skills2))
            skills_score = (intersection / union * 100) if union > 0 else 0
            scores.append(skills_score)
            weights.append(0.1)  # 10% weight
        
        # Calculate weighted average
        if not scores:
            return 0.0
        
        weighted_score = sum(s * w for s, w in zip(scores, weights))
        total_weight = sum(weights)
        
        return weighted_score / total_weight if total_weight > 0 else 0.0
    
    def is_duplicate(
        self, 
        candidate: Dict[str, Any], 
        existing: Dict[str, Any]
    ) -> bool:
        """
        Check if two candidates are duplicates
        Returns True if similarity exceeds threshold
        """
        score = self.calculate_similarity(candidate, existing)
        return score >= self.combined_threshold
    
    def merge_candidates(
        self, 
        primary: Dict[str, Any], 
        duplicate: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Merge duplicate candidate data
        Primary candidate takes precedence, but fills in missing fields
        """
        merged = primary.copy()
        
        # Fill in missing fields from duplicate
        for key, value in duplicate.items():
            if key not in merged or not merged[key]:
                merged[key] = value
        
        # Merge skills (combine unique skills)
        primary_skills = set(merged.get('primary_skills', []))
        duplicate_skills = set(duplicate.get('primary_skills', []))
        merged['primary_skills'] = list(primary_skills.union(duplicate_skills))
        
        # Merge experience (keep both)
        primary_exp = merged.get('experience', [])
        duplicate_exp = duplicate.get('experience', [])
        if isinstance(primary_exp, list) and isinstance(duplicate_exp, list):
            merged['experience'] = primary_exp + duplicate_exp
        
        # Track merge history
        merged['merged_from'] = duplicate.get('candidate_id') or duplicate.get('id')
        merged['merge_score'] = self.calculate_similarity(primary, duplicate)
        
        return merged
    
    def _normalize_email(self, email: str) -> str:
        """Normalize email for comparison"""
        if not email:
            return ''
        return email.lower().strip()
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone for comparison"""
        if not phone:
            return ''
        # Remove all non-digit characters
        digits = re.sub(r'\D', '', str(phone))
        # Keep last 10 digits (Indian format)
        return digits[-10:] if len(digits) >= 10 else digits
    
    def _normalize_name(self, name: str) -> str:
        """Normalize name for comparison"""
        if not name:
            return ''
        # Convert to lowercase, remove extra spaces
        name = name.lower().strip()
        # Remove common titles
        name = re.sub(r'\b(mr|mrs|ms|dr|prof)\b\.?', '', name)
        # Remove extra whitespace
        name = re.sub(r'\s+', ' ', name)
        return name.strip()
    
    def _normalize_skills(self, skills: List[str]) -> List[str]:
        """Normalize skills for comparison"""
        if not skills:
            return []
        return [skill.lower().strip() for skill in skills if skill]
    
    def find_similar_names(
        self, 
        name: str, 
        candidate_names: List[str], 
        threshold: int = 85
    ) -> List[Tuple[str, float]]:
        """
        Find similar names using fuzzy matching
        Returns list of (name, score) tuples
        """
        if not name or not candidate_names:
            return []
        
        normalized_name = self._normalize_name(name)
        normalized_candidates = [self._normalize_name(n) for n in candidate_names]
        
        # Use rapidfuzz process.extract for efficient fuzzy matching
        matches = process.extract(
            normalized_name,
            normalized_candidates,
            scorer=fuzz.token_sort_ratio,
            limit=10
        )
        
        # Filter by threshold and return original names
        results = []
        for match, score, idx in matches:
            if score >= threshold:
                results.append((candidate_names[idx], score))
        
        return results
    
    def detect_duplicate_by_email(
        self, 
        email: str, 
        existing_emails: List[str]
    ) -> Optional[str]:
        """
        Quick duplicate detection by exact email match
        Returns matching email if found
        """
        if not email:
            return None
        
        normalized = self._normalize_email(email)
        normalized_existing = [self._normalize_email(e) for e in existing_emails]
        
        if normalized in normalized_existing:
            idx = normalized_existing.index(normalized)
            return existing_emails[idx]
        
        return None
    
    def detect_duplicate_by_phone(
        self, 
        phone: str, 
        existing_phones: List[str]
    ) -> Optional[str]:
        """
        Quick duplicate detection by phone match
        Returns matching phone if found
        """
        if not phone:
            return None
        
        normalized = self._normalize_phone(phone)
        normalized_existing = [self._normalize_phone(p) for p in existing_phones]
        
        if normalized in normalized_existing:
            idx = normalized_existing.index(normalized)
            return existing_phones[idx]
        
        return None
    
    def batch_deduplicate(
        self, 
        candidates: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Deduplicate a batch of candidates
        Returns (unique_candidates, duplicates)
        """
        unique = []
        duplicates = []
        
        for candidate in candidates:
            is_dup = False
            
            for existing in unique:
                if self.is_duplicate(candidate, existing):
                    duplicates.append({
                        'candidate': candidate,
                        'duplicate_of': existing,
                        'similarity': self.calculate_similarity(candidate, existing)
                    })
                    is_dup = True
                    break
            
            if not is_dup:
                unique.append(candidate)
        
        logger.info(f"Batch deduplication: {len(unique)} unique, {len(duplicates)} duplicates")
        
        return unique, duplicates
    
    def get_deduplication_report(
        self, 
        candidate: Dict[str, Any], 
        duplicates: List[Tuple[Dict[str, Any], float]]
    ) -> Dict[str, Any]:
        """Generate detailed deduplication report"""
        return {
            'candidate': {
                'name': candidate.get('full_name'),
                'email': candidate.get('email'),
                'phone': candidate.get('phone')
            },
            'duplicates_found': len(duplicates),
            'matches': [
                {
                    'candidate_id': dup[0].get('candidate_id') or dup[0].get('id'),
                    'name': dup[0].get('full_name'),
                    'email': dup[0].get('email'),
                    'phone': dup[0].get('phone'),
                    'similarity_score': round(dup[1], 2),
                    'confidence': self._get_confidence_level(dup[1])
                }
                for dup in duplicates
            ]
        }
    
    def _get_confidence_level(self, score: float) -> str:
        """Get confidence level based on similarity score"""
        if score >= 95:
            return 'very_high'
        elif score >= 90:
            return 'high'
        elif score >= 85:
            return 'medium'
        else:
            return 'low'
