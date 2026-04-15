import { Request, Response } from 'express';
import { pool } from '../lib/database';

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
