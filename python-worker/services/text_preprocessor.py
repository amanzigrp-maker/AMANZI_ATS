"""
Text Preprocessing Service
Removes noise and extracts relevant sections for 30% faster parsing
"""
import re
from typing import List, Tuple
from loguru import logger


class TextPreprocessor:
    """Preprocess resume text to improve parsing speed and accuracy"""
    
    def __init__(self):
        # Section keywords to identify important parts
        self.section_keywords = [
            'experience', 'work experience', 'employment', 'work history',
            'education', 'academic', 'qualification', 'degree',
            'skills', 'technical skills', 'core competencies', 'expertise',
            'projects', 'achievements', 'accomplishments',
            'certifications', 'certificates', 'training',
            'summary', 'objective', 'profile', 'about',
            'contact', 'personal', 'details'
        ]
        
        # Noise patterns to remove
        self.noise_patterns = [
            r'Page \d+ of \d+',
            r'Confidential|Private|Internal Use Only',
            r'Resume|CV|Curriculum Vitae',
            r'References available upon request',
            r'©\s*\d{4}',
            r'www\.\w+\.com/privacy',
            r'Terms and Conditions',
            r'\[Insert.*?\]',
            r'<.*?>',  # HTML tags
        ]
    
    def preprocess(self, text: str) -> str:
        """Main preprocessing pipeline"""
        
        # Step 1: Remove noise
        text = self._remove_noise(text)
        
        # Step 2: Extract relevant sections
        text = self._extract_relevant_sections(text)
        
        # Step 3: Clean whitespace
        text = self._clean_whitespace(text)
        
        # Step 4: Limit length (keep first 2500 chars for LLM)
        text = text[:2500]
        
        logger.debug(f"Preprocessed text: {len(text)} chars")
        return text

    def clean_text(self, text: str) -> str:
        """Backward-compatible alias for preprocess()."""
        return self.preprocess(text)
    
    def _remove_noise(self, text: str) -> str:
        """Remove common noise patterns"""
        
        for pattern in self.noise_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        
        # Remove multiple spaces
        text = re.sub(r'\s+', ' ', text)
        
        return text
    
    def _extract_relevant_sections(self, text: str) -> str:
        """Extract only relevant resume sections"""
        
        lines = text.split('\n')
        relevant_lines = []
        in_relevant_section = False
        section_buffer = []
        
        for line in lines:
            line_lower = line.lower().strip()
            
            # Check if line is a section header
            is_section_header = any(
                keyword in line_lower 
                for keyword in self.section_keywords
            )
            
            if is_section_header:
                in_relevant_section = True
                section_buffer = [line]
            elif in_relevant_section:
                section_buffer.append(line)
                
                # Stop section after empty line or new section
                if not line.strip() or is_section_header:
                    relevant_lines.extend(section_buffer[:50])  # Max 50 lines per section
                    section_buffer = []
                    in_relevant_section = False
        
        # Add remaining buffer
        if section_buffer:
            relevant_lines.extend(section_buffer[:50])
        
        # If no sections found, return first 100 lines
        if not relevant_lines:
            relevant_lines = lines[:100]
        
        return '\n'.join(relevant_lines)
    
    def _clean_whitespace(self, text: str) -> str:
        """Clean excessive whitespace"""
        
        # Remove multiple newlines
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
        
        # Remove leading/trailing whitespace from lines
        lines = [line.strip() for line in text.split('\n')]
        text = '\n'.join(lines)
        
        return text.strip()
    
    def extract_contact_info(self, text: str) -> dict:
        """Quick extraction of contact info (for caching key)"""
        
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        phone_pattern = r'(\+91[\s-]?)?[6-9]\d{9}'
        
        emails = re.findall(email_pattern, text)
        phones = re.findall(phone_pattern, text)
        
        return {
            'email': emails[0] if emails else None,
            'phone': phones[0] if phones else None
        }
