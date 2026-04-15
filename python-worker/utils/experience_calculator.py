"""
Helper function to calculate total experience years from parsed resume data
"""
from datetime import datetime
from typing import Dict, Any, List, Tuple
import re


def calculate_total_experience(parsed: Dict[str, Any]) -> int:
    """
    Calculate total experience years from experience_summary or work_experience.
    Merges overlapping year intervals to avoid double-counting concurrent roles.
    If end_year is missing/null, uses current year.
    """
    current_year = datetime.now().year
    
    # Try different possible keys for experience data
    experience_data = None
    for key in ['experience_summary', 'work_experience', 'experience', 'employment_history']:
        if key in parsed and parsed[key]:
            experience_data = parsed[key]
            break
    
    if not experience_data:
        return 0
    
    # Handle if it's a string (parse it)
    if isinstance(experience_data, str):
        # Try to extract years from string format
        years_match = re.search(r'(\d+)\s*(?:years?|yrs?)', experience_data.lower())
        if years_match:
            return int(years_match.group(1))
        return 0
    
    # Handle if it's a list of experiences
    if not isinstance(experience_data, list):
        return 0
    
    # Collect all year intervals
    intervals: List[Tuple[int, int]] = []
    
    for exp in experience_data:
        if not isinstance(exp, dict):
            continue
        
        # Try to get start and end years
        start_year = None
        end_year = None
        
        # Try different possible keys for start year
        for start_key in ['start_year', 'from_year', 'start_date', 'from', 'started']:
            if start_key in exp and exp[start_key]:
                try:
                    val = str(exp[start_key])
                    # Extract year from various formats (2020, "2020", "2020-01-01", etc.)
                    year_match = re.search(r'(19|20)\d{2}', val)
                    if year_match:
                        start_year = int(year_match.group(0))
                        break
                except (ValueError, TypeError):
                    pass
        
        # Try different possible keys for end year
        for end_key in ['end_year', 'to_year', 'end_date', 'to', 'until', 'ended']:
            if end_key in exp and exp[end_key]:
                val = exp[end_key]
                if isinstance(val, str) and val.lower().strip() in ['present', 'current', 'now', '']:
                    end_year = current_year
                    break
                try:
                    val_str = str(val)
                    year_match = re.search(r'(19|20)\d{2}', val_str)
                    if year_match:
                        end_year = int(year_match.group(0))
                        break
                except (ValueError, TypeError):
                    pass
        
        # If no end year found, assume current
        if start_year and not end_year:
            end_year = current_year
        
        # Add valid interval
        if start_year and end_year and end_year >= start_year:
            intervals.append((start_year, end_year))
    
    # Merge overlapping intervals
    if not intervals:
        return 0
    
    # Sort intervals by start year
    intervals.sort()
    
    # Merge overlapping intervals
    merged: List[Tuple[int, int]] = [intervals[0]]
    
    for start, end in intervals[1:]:
        last_start, last_end = merged[-1]
        
        # If current interval overlaps with last merged interval
        if start <= last_end + 1:  # +1 to handle consecutive years (2020-2021, 2021-2022)
            # Merge by extending the end year
            merged[-1] = (last_start, max(last_end, end))
        else:
            # No overlap, add as new interval
            merged.append((start, end))
    
    # Calculate total years from merged intervals
    total_years = 0
    for start, end in merged:
        years = end - start
        # Count same-year roles as 1 year minimum
        if years == 0:
            years = 1
        total_years += years
    
    return total_years
