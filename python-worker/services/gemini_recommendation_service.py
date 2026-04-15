"""
Gemini-Based Recommendation Service
Uses Gemini API to intelligently match candidates to jobs
"""
import json
from typing import List, Dict, Any
from loguru import logger
import google.generativeai as genai
from config import settings


class GeminiRecommendationService:
    """Use Gemini API for intelligent candidate-job matching"""
    
    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.model_name = settings.gemini_model
        
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is required for Gemini recommendations")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self._normalize_model_name(self.model_name))
        logger.info(f"✅ Gemini recommendation service initialized: {self.model_name}")
    
    async def rank_candidates(
        self,
        job_data: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Use Gemini to intelligently rank candidates for a job
        
        Args:
            job_data: Job description, requirements, skills
            candidates: List of candidate profiles with embeddings scores
            top_k: Number of top candidates to return
            
        Returns:
            List of candidates with Gemini-enhanced scores and explanations
        """
        try:
            # Create prompt for Gemini
            prompt = self._create_ranking_prompt(job_data, candidates, top_k)
            
            # Get Gemini's analysis
            response = await self._generate_response(prompt)
            
            # Parse Gemini's response
            ranked_candidates = self._parse_ranking_response(response, candidates)
            
            logger.info(f"✅ Gemini ranked {len(ranked_candidates)} candidates")
            return ranked_candidates[:top_k]
            
        except Exception as e:
            logger.error(f"Error in Gemini ranking: {e}")
            # Fallback to embedding-based scores
            logger.warning("Falling back to embedding-based ranking")
            return sorted(candidates, key=lambda x: x.get('final_score', 0), reverse=True)[:top_k]
    
    async def explain_match(
        self,
        job_data: Dict[str, Any],
        candidate_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Get detailed explanation of why a candidate matches a job
        
        Args:
            job_data: Job description and requirements
            candidate_data: Candidate profile
            
        Returns:
            Dictionary with match explanation and scores
        """
        try:
            prompt = self._create_explanation_prompt(job_data, candidate_data)
            response = await self._generate_response(prompt)
            explanation = self._parse_explanation_response(response)
            
            return explanation
            
        except Exception as e:
            logger.error(f"Error generating match explanation: {e}")
            return {
                "match_score": candidate_data.get('final_score', 0),
                "explanation": "Unable to generate detailed explanation",
                "strengths": [],
                "gaps": []
            }
    
    def _create_ranking_prompt(
        self,
        job_data: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        top_k: int
    ) -> str:
        """Create prompt for candidate ranking"""
        
        job_title = job_data.get('title', 'Position')
        job_description = job_data.get('description', '')
        required_skills = job_data.get('skills', [])
        experience_level = job_data.get('experience_level', '')
        
        # Prepare candidate summaries
        candidate_summaries = []
        for i, cand in enumerate(candidates[:20]):  # Limit to top 20 for token efficiency
            summary = {
                "id": i + 1,
                "name": cand.get('full_name', 'Candidate'),
                "designation": cand.get('current_designation', ''),
                "experience_years": cand.get('total_experience_years', 0),
                "skills": cand.get('skills', [])[:10],  # Top 10 skills
                "embedding_score": round(cand.get('final_score', 0) * 100, 1)
            }
            candidate_summaries.append(summary)
        
        prompt = f"""You are an expert technical recruiter. Analyze and rank candidates for this job.

JOB DETAILS:
Title: {job_title}
Description: {job_description[:500]}
Required Skills: {', '.join(required_skills[:15])}
Experience Level: {experience_level}

CANDIDATES (with AI embedding similarity scores):
{json.dumps(candidate_summaries, indent=2)}

TASK:
1. Analyze each candidate's fit for this role
2. Consider: skills match, experience level, role relevance
3. The embedding_score shows semantic similarity (0-100)
4. Rank the top {top_k} candidates
5. Provide a brief reason for each ranking

Return ONLY valid JSON in this format:
{{
  "rankings": [
    {{
      "candidate_id": 1,
      "gemini_score": 95,
      "reason": "Perfect skills match, relevant experience",
      "strengths": ["Python expert", "5 years Django"],
      "concerns": ["No cloud experience mentioned"]
    }}
  ]
}}

Focus on practical fit, not just keyword matching. Consider the embedding scores as a baseline."""
        
        return prompt
    
    def _create_explanation_prompt(
        self,
        job_data: Dict[str, Any],
        candidate_data: Dict[str, Any]
    ) -> str:
        """Create prompt for match explanation"""
        
        prompt = f"""Explain why this candidate matches this job.

JOB:
Title: {job_data.get('title', '')}
Description: {job_data.get('description', '')[:500]}
Required Skills: {', '.join(job_data.get('skills', [])[:10])}

CANDIDATE:
Name: {candidate_data.get('full_name', '')}
Current Role: {candidate_data.get('current_designation', '')}
Experience: {candidate_data.get('total_experience_years', 0)} years
Skills: {', '.join(candidate_data.get('skills', [])[:15])}

Return ONLY valid JSON:
{{
  "match_score": 85,
  "summary": "Brief 1-sentence summary",
  "strengths": ["Strength 1", "Strength 2"],
  "gaps": ["Gap 1", "Gap 2"],
  "recommendation": "hire" | "interview" | "maybe" | "pass"
}}"""
        
        return prompt
    
    async def _generate_response(self, prompt: str) -> str:
        """Generate response from Gemini"""
        try:
            response = self.model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.3,  # Lower for more consistent rankings
                    "top_p": 0.9,
                    "max_output_tokens": 4096,
                    "response_mime_type": "application/json",
                }
            )
            
            text = (getattr(response, "text", None) or "").strip()
            
            if not text and getattr(response, "candidates", None):
                parts = []
                for c in response.candidates:
                    content = getattr(c, "content", None)
                    if not content:
                        continue
                    for p in getattr(content, "parts", []) or []:
                        t = getattr(p, "text", None)
                        if t:
                            parts.append(t)
                text = ("".join(parts) or "").strip()
            
            if not text:
                raise RuntimeError("Gemini returned empty response")
            
            return text
            
        except Exception as e:
            logger.error(f"Error generating Gemini response: {e}")
            raise
    
    def _parse_ranking_response(
        self,
        response: str,
        original_candidates: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Parse Gemini's ranking response"""
        try:
            # Extract JSON from response
            json_text = self._extract_json(response)
            data = json.loads(json_text)
            
            rankings = data.get('rankings', [])
            
            # Merge Gemini scores with original candidate data
            ranked_candidates = []
            for rank in rankings:
                candidate_id = rank.get('candidate_id', 0) - 1  # Convert to 0-indexed
                
                if 0 <= candidate_id < len(original_candidates):
                    candidate = original_candidates[candidate_id].copy()
                    
                    # Add Gemini enhancements
                    gemini_score = rank.get('gemini_score', 0) / 100.0
                    embedding_score = candidate.get('final_score', 0)
                    
                    # Combine scores (70% Gemini, 30% embeddings)
                    candidate['final_score'] = (0.7 * gemini_score) + (0.3 * embedding_score)
                    candidate['gemini_score'] = gemini_score
                    candidate['embedding_score'] = embedding_score
                    candidate['match_reason'] = rank.get('reason', '')
                    candidate['strengths'] = rank.get('strengths', [])
                    candidate['concerns'] = rank.get('concerns', [])
                    
                    ranked_candidates.append(candidate)
            
            return ranked_candidates
            
        except Exception as e:
            logger.error(f"Error parsing Gemini ranking: {e}")
            # Return original candidates sorted by embedding score
            return sorted(original_candidates, key=lambda x: x.get('final_score', 0), reverse=True)
    
    def _parse_explanation_response(self, response: str) -> Dict[str, Any]:
        """Parse match explanation response"""
        try:
            json_text = self._extract_json(response)
            return json.loads(json_text)
        except Exception as e:
            logger.error(f"Error parsing explanation: {e}")
            return {
                "match_score": 0,
                "summary": "Unable to generate explanation",
                "strengths": [],
                "gaps": [],
                "recommendation": "unknown"
            }
    
    def _extract_json(self, text: str) -> str:
        """Extract JSON from text response"""
        # Remove markdown code blocks
        if "```" in text:
            text = text.replace("```json", "").replace("```", "").strip()
        
        # Find JSON object
        start = text.find("{")
        if start == -1:
            raise RuntimeError("No JSON found in response")
        
        end = text.rfind("}")
        if end == -1:
            raise RuntimeError("Incomplete JSON in response")
        
        return text[start:end + 1]
    
    def _normalize_model_name(self, name: str) -> str:
        """Normalize model name"""
        n = (name or "").strip()
        if not n:
            return "gemini-2.0-flash-exp"
        if n.startswith("models/"):
            return n
        return n
