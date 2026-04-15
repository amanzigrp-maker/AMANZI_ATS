"""
Excel Resume Parser - Parse resumes from XLS/XLSX files
Handles both individual resume sheets and bulk candidate lists
"""
import pandas as pd
import openpyxl
from typing import Dict, Any, List, Optional
from pathlib import Path
from loguru import logger
from datetime import datetime
import re


class ExcelResumeParser:
    """Parse resumes and candidate data from Excel files"""
    
    def __init__(self):
        self.email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        self.phone_pattern = re.compile(r'(?:\+91[\s-]*)?([6-9]\d[\s-]*\d{3}[\s-]*\d{5})')
        
    async def parse_file(self, file_path: str, filename: str) -> Dict[str, Any]:
        """Parse Excel file - auto-detect format"""
        try:
            logger.info(f"📊 Parsing Excel file: {filename}")
            
            file_ext = Path(filename).suffix.lower()
            
            # Read Excel file
            if file_ext == '.xlsx':
                df = pd.read_excel(file_path, engine='openpyxl')
            elif file_ext == '.xls':
                df = pd.read_excel(file_path, engine='xlrd')
            else:
                raise ValueError(f"Unsupported Excel format: {file_ext}")
            
            # Detect format: single resume or bulk candidate list
            if self._is_bulk_candidate_list(df):
                logger.info("📋 Detected bulk candidate list format")
                return await self._parse_bulk_candidates(df, filename)
            else:
                logger.info("📄 Detected single resume format")
                return await self._parse_single_resume(df, filename)
                
        except Exception as e:
            logger.error(f"Error parsing Excel file {filename}: {str(e)}")
            raise
    
    def _is_bulk_candidate_list(self, df: pd.DataFrame) -> bool:
        """Detect if Excel is a bulk candidate list (multiple rows)"""
        # Check if it has typical candidate list columns
        columns_lower = [str(col).lower() for col in df.columns]
        
        candidate_indicators = [
            'name', 'email', 'phone', 'mobile', 'contact',
            'skill', 'experience', 'qualification', 'education',
            'current company', 'designation', 'location'
        ]
        
        matches = sum(1 for indicator in candidate_indicators 
                     if any(indicator in col for col in columns_lower))
        
        # If has 3+ typical columns and multiple rows, it's a bulk list
        return matches >= 3 and len(df) > 1
    
    async def _parse_bulk_candidates(self, df: pd.DataFrame, filename: str) -> Dict[str, Any]:
        """Parse bulk candidate list from Excel"""
        candidates = []
        
        # Normalize column names
        df.columns = [str(col).strip().lower() for col in df.columns]
        
        # Map common column variations
        column_map = self._create_column_map(df.columns)
        
        for idx, row in df.iterrows():
            try:
                candidate = self._extract_candidate_from_row(row, column_map)
                if candidate.get('email') or candidate.get('phone'):
                    candidates.append(candidate)
                    logger.info(f"   ✅ Row {idx + 1}: {candidate.get('full_name', 'Unknown')}")
                else:
                    logger.warning(f"   ⚠️ Row {idx + 1}: Missing contact info, skipped")
            except Exception as e:
                logger.warning(f"   ❌ Row {idx + 1}: Error - {str(e)}")
                continue
        
        logger.info(f"✅ Parsed {len(candidates)} candidates from bulk list")
        
        return {
            'type': 'bulk_candidate_list',
            'total_candidates': len(candidates),
            'candidates': candidates,
            'filename': filename,
            'parsed_at': datetime.utcnow().isoformat()
        }
    
    def _create_column_map(self, columns: List[str]) -> Dict[str, str]:
        """Map Excel columns to standard fields"""
        column_map = {}
        
        # Name variations
        name_cols = ['name', 'candidate name', 'full name', 'candidate', 'employee name']
        for col in columns:
            if any(name_col in col for name_col in name_cols):
                column_map['name'] = col
                break
        
        # Email variations
        email_cols = ['email', 'e-mail', 'email id', 'email address', 'mail']
        for col in columns:
            if any(email_col in col for email_col in email_cols):
                column_map['email'] = col
                break
        
        # Phone variations
        phone_cols = ['phone', 'mobile', 'contact', 'contact number', 'mobile number', 'phone number']
        for col in columns:
            if any(phone_col in col for phone_col in phone_cols):
                column_map['phone'] = col
                break
        
        # Skills variations
        skill_cols = ['skill', 'skills', 'technical skills', 'key skills', 'core skills']
        for col in columns:
            if any(skill_col in col for skill_col in skill_cols):
                column_map['skills'] = col
                break
        
        # Experience variations
        exp_cols = ['experience', 'total experience', 'years of experience', 'exp', 'work experience']
        for col in columns:
            if any(exp_col in col for exp_col in exp_cols):
                column_map['experience'] = col
                break
        
        # Education variations
        edu_cols = ['education', 'qualification', 'degree', 'highest qualification']
        for col in columns:
            if any(edu_col in col for edu_col in edu_cols):
                column_map['education'] = col
                break
        
        # Location variations
        loc_cols = ['location', 'city', 'current location', 'preferred location']
        for col in columns:
            if any(loc_col in col for loc_col in loc_cols):
                column_map['location'] = col
                break
        
        # Current Company variations
        company_cols = ['current company', 'company', 'organization', 'employer', 'current employer']
        for col in columns:
            if any(company_col in col for company_col in company_cols):
                column_map['current_company'] = col
                break
        
        # Designation variations
        designation_cols = ['designation', 'role', 'position', 'job title', 'current role']
        for col in columns:
            if any(designation_col in col for designation_col in designation_cols):
                column_map['designation'] = col
                break
        
        return column_map
    
    def _extract_candidate_from_row(self, row: pd.Series, column_map: Dict[str, str]) -> Dict[str, Any]:
        """Extract candidate data from Excel row"""
        candidate = {}
        
        # Extract name
        if 'name' in column_map:
            name = str(row[column_map['name']]).strip()
            if name and name.lower() not in ['nan', 'none', '']:
                candidate['full_name'] = name
        
        # Extract email
        if 'email' in column_map:
            email = str(row[column_map['email']]).strip()
            if email and self.email_pattern.match(email):
                candidate['email'] = email.lower()
        
        # Extract phone
        if 'phone' in column_map:
            phone = str(row[column_map['phone']]).strip()
            phone_match = self.phone_pattern.search(phone)
            if phone_match:
                candidate['phone'] = phone_match.group(0).replace(' ', '').replace('-', '')
        
        # Extract skills
        if 'skills' in column_map:
            skills_text = str(row[column_map['skills']]).strip()
            if skills_text and skills_text.lower() not in ['nan', 'none', '']:
                # Split by common delimiters
                skills = re.split(r'[,;|/\n]', skills_text)
                candidate['primary_skills'] = [s.strip() for s in skills if s.strip()]
        
        # Extract experience
        if 'experience' in column_map:
            exp_text = str(row[column_map['experience']]).strip()
            if exp_text and exp_text.lower() not in ['nan', 'none', '']:
                # Try to extract years
                exp_match = re.search(r'(\d+(?:\.\d+)?)', exp_text)
                if exp_match:
                    candidate['total_experience_years'] = float(exp_match.group(1))
                candidate['experience_text'] = exp_text
        
        # Extract education
        if 'education' in column_map:
            edu_text = str(row[column_map['education']]).strip()
            if edu_text and edu_text.lower() not in ['nan', 'none', '']:
                candidate['education'] = [{
                    'degree': edu_text,
                    'institution': '',
                    'year': ''
                }]
        
        # Extract location
        if 'location' in column_map:
            location = str(row[column_map['location']]).strip()
            if location and location.lower() not in ['nan', 'none', '']:
                candidate['location'] = location
        
        # Extract current company
        if 'current_company' in column_map:
            company = str(row[column_map['current_company']]).strip()
            if company and company.lower() not in ['nan', 'none', '']:
                candidate['current_company'] = company
        
        # Extract designation
        if 'designation' in column_map:
            designation = str(row[column_map['designation']]).strip()
            if designation and designation.lower() not in ['nan', 'none', '']:
                candidate['current_designation'] = designation
        
        return candidate
    
    async def _parse_single_resume(self, df: pd.DataFrame, filename: str) -> Dict[str, Any]:
        """Parse single resume from Excel (key-value format)"""
        # Convert DataFrame to text
        text_parts = []
        
        for idx, row in df.iterrows():
            row_text = ' '.join([str(val) for val in row.values if pd.notna(val)])
            if row_text.strip():
                text_parts.append(row_text)
        
        raw_text = '\n'.join(text_parts)
        
        # Extract basic information using regex
        parsed_data = {
            'full_name': self._extract_name_from_text(raw_text),
            'email': self._extract_email(raw_text),
            'phone': self._extract_phone(raw_text),
            'primary_skills': self._extract_skills_from_text(raw_text),
            'raw_text': raw_text[:5000],
            'filename': filename,
            'file_type': '.xlsx',
            'parsed_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f"✅ Parsed single resume from Excel")
        return parsed_data
    
    def _extract_name_from_text(self, text: str) -> str:
        """Extract name from text"""
        lines = text.split('\n')
        for line in lines[:5]:  # Check first 5 lines
            line = line.strip()
            if line and len(line.split()) <= 4 and len(line) < 50:
                # Likely a name
                if not self.email_pattern.search(line) and not self.phone_pattern.search(line):
                    return line
        return ""
    
    def _extract_email(self, text: str) -> str:
        """Extract email from text"""
        match = self.email_pattern.search(text)
        return match.group(0).lower() if match else ""
    
    def _extract_phone(self, text: str) -> str:
        """Extract phone from text"""
        match = self.phone_pattern.search(text)
        return match.group(0).replace(' ', '').replace('-', '') if match else ""
    
    def _extract_skills_from_text(self, text: str) -> List[str]:
        """Extract skills from text"""
        # Basic skill extraction
        common_skills = [
            'python', 'java', 'javascript', 'react', 'node.js', 'sql',
            'aws', 'docker', 'kubernetes', 'mongodb', 'postgresql'
        ]
        
        text_lower = text.lower()
        found_skills = [skill for skill in common_skills if skill in text_lower]
        return found_skills
