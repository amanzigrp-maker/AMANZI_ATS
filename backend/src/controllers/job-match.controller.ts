import { Request, Response } from 'express';
import { pool } from '../lib/database';
import axios from 'axios';

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_BASE_URL || "http://127.0.0.1:8001";

export const getJobMatches = async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.job_id);
    if (!jobId || Number.isNaN(jobId)) {
      return res.status(400).json({ error: 'job_id must be a valid number' });
    }

    const jobExists = await pool.query(
      `SELECT 1 FROM job_embeddings WHERE job_id = $1 AND required_skills_embedding IS NOT NULL LIMIT 1`,
      [jobId]
    );

    if (!jobExists.rows.length) {
      return res.status(404).json({ error: 'Job embedding not found' });
    }

    const result = await pool.query(
      `
      SELECT
        c.candidate_id,
        c.full_name,
        ROUND((1 - (ce.embedding <=> je.required_skills_embedding))::numeric, 3) AS similarity
      FROM candidate_embeddings ce
      JOIN job_embeddings je
        ON je.job_id = $1
      JOIN candidates c
        ON c.candidate_id = ce.candidate_id
      WHERE ce.section = 'skills'
      ORDER BY ce.embedding <=> je.required_skills_embedding
      LIMIT 20;
      `,
      [jobId]
    );

    const data = (result.rows || []).map((row: any) => {
      const similarity = Number(row.similarity) || 0;
      const matchPercent = Math.max(0, Math.round(similarity * 100));
      return {
        candidate_id: Number(row.candidate_id),
        full_name: String(row.full_name || ''),
        match_percent: matchPercent,
      };
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Job match error:', error);
    return res.status(500).json({ error: 'Failed to fetch job matches' });
  }
};

/**
 * Rank candidates who have applied for a specific job using Pure AI (Gemini)
 * GET /api/jobs/:job_id/rank-applicants
 */
export const rankJobApplicants = async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.job_id);
    if (!jobId || Number.isNaN(jobId)) {
      return res.status(400).json({ error: 'job_id must be a valid number' });
    }

    // 1. Fetch Job details
    const jobResult = await pool.query(
      "SELECT job_id, title, description, skills, experience_level FROM jobs WHERE job_id = $1",
      [jobId]
    );

    if (!jobResult.rows.length) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobData = jobResult.rows[0];

    // 2. Fetch candidates who applied for this job
    const candidatesResult = await pool.query(
      `
      SELECT 
        c.candidate_id,
        c.full_name,
        c.email,
        c.current_designation,
        c.current_company,
        c.total_experience,
        c.skills,
        c.location
      FROM applications a
      JOIN candidates c ON c.candidate_id = a.candidate_id
      WHERE a.job_id = $1 AND c.candidate_id IS NOT NULL
      `,
      [jobId]
    );

    if (!candidatesResult.rows.length) {
      return res.json({
        success: true,
        count: 0,
        data: [],
        message: 'No applicants found for this job'
      });
    }

    const candidates = candidatesResult.rows.map(c => ({
      ...c,
      total_experience_years: parseFloat(c.total_experience) || 0,
      final_score: 0 // Baseline score for Gemini to consider
    }));

    // 3. Call Python Worker for Pure AI Ranking
    try {
      const response = await axios.post(`${PYTHON_WORKER_URL}/gemini-rank`, {
        job_data: {
          title: jobData.title,
          description: jobData.description,
          skills: Array.isArray(jobData.skills) ? jobData.skills : [],
          experience_level: jobData.experience_level
        },
        candidates: candidates,
        top_k: 10
      }, {
        timeout: 60000 // AI ranking can take time
      });

      if (response.data && response.data.success) {
        const ranked = response.data.ranked_candidates.map((c: any) => ({
          candidate_id: c.candidate_id,
          full_name: c.full_name,
          email: c.email,
          current_designation: c.current_designation,
          skills: c.skills,
          match_percent: Math.round((c.gemini_score || c.final_score || 0) * 100),
          reason: c.match_reason || c.reason || '',
          strengths: c.strengths || [],
          concerns: c.concerns || []
        }));

        return res.json({
          success: true,
          count: ranked.length,
          data: ranked,
          method: 'gemini-ai'
        });
      }
    } catch (aiError: any) {
      console.warn('Gemini ranking failed, falling back to basic info:', aiError.message);
    }

    // Fallback: If AI fails, return candidates in order of application
    const fallbackData = candidates.map((row: any) => ({
      candidate_id: Number(row.candidate_id),
      full_name: String(row.full_name || ''),
      email: String(row.email || ''),
      current_designation: String(row.current_designation || ''),
      skills: Array.isArray(row.skills) ? row.skills : [],
      match_percent: 0,
    }));

    return res.json({
      success: true,
      count: fallbackData.length,
      data: fallbackData.slice(0, 10),
      method: 'fallback'
    });

  } catch (error: any) {
    console.error('Rank applicants error:', error);
    return res.status(500).json({ error: 'Failed to rank applicants', detail: error.message });
  }
};
