/**
 * Search Controller - Advanced full-text search with Elasticsearch
 */
import { Request, Response } from 'express';
import elasticsearchService from '../services/elasticsearch.service';
import { pool } from '../lib/database';

/**
 * Search resumes with full-text query
 */
export const searchResumes = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { query, page = 1, limit = 20, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Search query is required'
      });
    }

    const from = (parseInt(page as string) - 1) * parseInt(limit as string);
    const size = parseInt(limit as string);

    // Build Elasticsearch filters
    const esFilters: any[] = [];
    if (filters.minExperience) {
      esFilters.push({
        range: { years_of_experience: { gte: parseInt(filters.minExperience) } }
      });
    }
    if (filters.location) {
      esFilters.push({
        match: { location: filters.location }
      });
    }

    const result = await elasticsearchService.searchResumes(query, {
      from,
      size,
      filters: esFilters
    });

    if (!result) {
      return res.status(503).json({
        error: 'Search service unavailable',
        message: 'Elasticsearch is not enabled'
      });
    }

    // Track search event
    const userId = (req as any).user?.userid;
    if (userId) {
      const responseTime = Date.now() - startTime;
      try {
        // analytics disabled
      } catch (error) {
        // best-effort
      }
    }

    res.json({
      success: true,
      data: result.hits,
      pagination: {
        page: parseInt(page as string),
        limit: size,
        total: result.total,
        totalPages: Math.ceil(result.total / size)
      },
      query: query
    });

  } catch (error) {
    console.error('Search resumes error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Hybrid resume search:
 * 1) Elasticsearch for keyword + filters (fast narrowing)
 * 2) pgvector rerank using candidate_embeddings (semantic)
 */
export const searchResumesHybrid = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const {
      query,
      page = 1,
      limit = 20,
      filters = {},
      job_id,
      vector_weight = 0.6,
      keyword_weight = 0.4,
    } = req.body || {};

    if (!query && !job_id) {
      return res.status(400).json({
        error: 'query or job_id is required',
      });
    }

    const from = (parseInt(page as string) - 1) * parseInt(limit as string);
    const size = parseInt(limit as string);

    // Build Elasticsearch filters
    const esFilters: any[] = [];
    if (filters.minExperience) {
      esFilters.push({
        range: { years_of_experience: { gte: parseInt(filters.minExperience) } },
      });
    }
    if (filters.location) {
      esFilters.push({
        match: { location: filters.location },
      });
    }

    const esQuery = String(query || '').trim() || '*';
    const esResult = await elasticsearchService.searchResumes(esQuery, {
      from,
      size,
      filters: esFilters,
    });

    if (!esResult) {
      return res.status(503).json({
        error: 'Search service unavailable',
        message: 'Elasticsearch is not enabled',
      });
    }

    // Collect candidate_ids from ES results for rerank
    const esHits = Array.isArray(esResult.hits) ? esResult.hits : [];
    const candidateIds = Array.from(
      new Set(
        esHits
          .map((h: any) => Number(h?.candidate_id))
          .filter((x: any) => Number.isFinite(x) && x > 0)
      )
    );

    if (candidateIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          page: parseInt(page as string),
          limit: size,
          total: 0,
          totalPages: 0,
        },
        query: esQuery,
        timing_ms: Date.now() - startTime,
      });
    }

    // Determine query embedding:
    // - If job_id provided, reuse job_embeddings.required_skills_embedding (preferred) else job_description_embedding
    // - Otherwise we can't embed in Node; return keyword-only until embedding is available.
    let queryEmbedding: number[] | null = null;
    if (Number.isFinite(Number(job_id))) {
      const jobEmb = await pool.query(
        `
        SELECT
          required_skills_embedding,
          job_description_embedding
        FROM job_embeddings
        WHERE job_id = $1
        LIMIT 1
        `,
        [Number(job_id)]
      );

      const row = jobEmb.rows?.[0];
      queryEmbedding = (row?.required_skills_embedding || row?.job_description_embedding) ?? null;
    }

    if (!queryEmbedding) {
      // Fallback: return ES ordering only
      return res.json({
        success: true,
        data: esHits,
        pagination: {
          page: parseInt(page as string),
          limit: size,
          total: esResult.total,
          totalPages: Math.ceil(esResult.total / size),
        },
        query: esQuery,
        timing_ms: Date.now() - startTime,
        note: 'No query embedding available; returned keyword results only',
      });
    }

    // Rerank with pgvector among ES candidates
    // Use best chunk per candidate (max similarity across chunks).
    const rerank = await pool.query(
      `
      WITH es_candidates AS (
        SELECT unnest($1::int[]) AS candidate_id
      ),
      best AS (
        SELECT
          ce.candidate_id,
          MAX(1 - (ce.embedding <=> $2::vector)) AS vector_similarity
        FROM candidate_embeddings ce
        JOIN es_candidates ec ON ec.candidate_id = ce.candidate_id
        WHERE ce.section IN ('summary','skills','experience','projects')
        GROUP BY ce.candidate_id
      )
      SELECT
        b.candidate_id,
        b.vector_similarity
      FROM best b
      ORDER BY b.vector_similarity DESC
      LIMIT $3
      `,
      [candidateIds, queryEmbedding, Math.max(50, candidateIds.length)]
    );

    const vectorByCandidate = new Map<number, number>();
    for (const r of rerank.rows || []) {
      const cid = Number(r.candidate_id);
      const sim = Number(r.vector_similarity) || 0;
      if (Number.isFinite(cid)) vectorByCandidate.set(cid, sim);
    }

    // Combine with ES score
    const vw = Math.max(0, Math.min(1, Number(vector_weight) || 0.6));
    const kw = Math.max(0, Math.min(1, Number(keyword_weight) || 0.4));
    const denom = vw + kw || 1;

    const merged = esHits
      .map((h: any) => {
        const cid = Number(h?.candidate_id);
        const esScore = Number(h?.score) || 0;
        const vScore = vectorByCandidate.get(cid) || 0;
        const finalScore = ((vw * vScore) + (kw * esScore)) / denom;
        return {
          ...h,
          vector_similarity: vScore,
          final_score: finalScore,
        };
      })
      .sort((a: any, b: any) => (b.final_score || 0) - (a.final_score || 0));

    return res.json({
      success: true,
      data: merged,
      pagination: {
        page: parseInt(page as string),
        limit: size,
        total: esResult.total,
        totalPages: Math.ceil(esResult.total / size),
      },
      query: esQuery,
      timing_ms: Date.now() - startTime,
    });
  } catch (error) {
    console.error('Hybrid search resumes error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Search jobs with full-text query
 */
export const searchJobs = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { query, page = 1, limit = 20, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Search query is required'
      });
    }

    const from = (parseInt(page as string) - 1) * parseInt(limit as string);
    const size = parseInt(limit as string);

    // Build Elasticsearch filters
    const esFilters: any[] = [];
    if (filters.employment_type) {
      esFilters.push({
        term: { employment_type: filters.employment_type }
      });
    }
    if (filters.experience_level) {
      esFilters.push({
        term: { experience_level: filters.experience_level }
      });
    }
    if (filters.location) {
      esFilters.push({
        match: { location: filters.location }
      });
    }

    const result = await elasticsearchService.searchJobs(query, {
      from,
      size,
      filters: esFilters
    });

    if (!result) {
      return res.status(503).json({
        error: 'Search service unavailable',
        message: 'Elasticsearch is not enabled'
      });
    }

    // Track search event
    const userId = (req as any).user?.userid;
    if (userId) {
      const responseTime = Date.now() - startTime;
      try {
        // analytics disabled
      } catch (error) {
        // best-effort
      }
    }

    res.json({
      success: true,
      data: result.hits,
      pagination: {
        page: parseInt(page as string),
        limit: size,
        total: result.total,
        totalPages: Math.ceil(result.total / size)
      },
      query: query
    });

  } catch (error) {
    console.error('Search jobs error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get skill suggestions for autocomplete
 */
export const suggestSkills = async (req: Request, res: Response) => {
  try {
    const { prefix, limit = 10 } = req.query;

    if (!prefix) {
      return res.status(400).json({
        error: 'Prefix is required'
      });
    }

    const suggestions = await elasticsearchService.suggestSkills(
      prefix as string,
      parseInt(limit as string)
    );

    if (!suggestions) {
      return res.status(503).json({
        error: 'Search service unavailable'
      });
    }

    res.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    console.error('Suggest skills error:', error);
    res.status(500).json({
      error: 'Autocomplete failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Reindex all resumes to Elasticsearch
 */
export const reindexResumes = async (req: Request, res: Response) => {
  try {
    // Check admin permission
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    // Fetch all resumes with candidate data
    const result = await pool.query(`
      SELECT 
        r.resume_id,
        r.candidate_id,
        c.full_name,
        c.email,
        c.phone,
        c.skills,
        c.experience,
        c.education,
        c.current_title,
        c.current_company,
        c.years_of_experience,
        c.location
      FROM resumes r
      LEFT JOIN candidates c ON r.candidate_id = c.candidate_id
      WHERE c.candidate_id IS NOT NULL
    `);

    const documents = result.rows.map(row => ({
      resume_id: row.resume_id,
      candidate_id: row.candidate_id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      raw_text: '', // Would need to read file content
      skills: row.skills,
      experience: JSON.stringify(row.experience),
      education: JSON.stringify(row.education),
      current_title: row.current_title,
      current_company: row.current_company,
      years_of_experience: row.years_of_experience,
      location: row.location
    }));

    await elasticsearchService.reindexAll('resumes', documents);

    res.json({
      success: true,
      message: `Reindexed ${documents.length} resumes`,
      count: documents.length
    });

  } catch (error) {
    console.error('Reindex resumes error:', error);
    res.status(500).json({
      error: 'Reindex failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Reindex all jobs to Elasticsearch
 */
export const reindexJobs = async (req: Request, res: Response) => {
  try {
    // Check admin permission
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    // Fetch all active jobs
    const result = await pool.query(`
      SELECT 
        job_id,
        title,
        company,
        description,
        requirements,
        skills,
        location,
        employment_type,
        experience_level,
        status
      FROM jobs
      WHERE status = 'active'
    `);

    const documents = result.rows.map(row => ({
      job_id: row.job_id,
      title: row.title,
      company: row.company,
      description: row.description,
      requirements: row.requirements,
      skills: row.skills,
      location: row.location,
      employment_type: row.employment_type,
      experience_level: row.experience_level,
      status: row.status
    }));

    await elasticsearchService.reindexAll('jobs', documents);

    res.json({
      success: true,
      message: `Reindexed ${documents.length} jobs`,
      count: documents.length
    });

  } catch (error) {
    console.error('Reindex jobs error:', error);
    res.status(500).json({
      error: 'Reindex failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
