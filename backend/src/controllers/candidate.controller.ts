/**
 * Candidate Controller - Handles candidate data operations
 */
import { Request, Response } from 'express';
import { pool } from '../lib/database';
import notificationService from '../services/notification.service';

/* -------------------------------------------------------------------------- */
/*                               SEARCH HELPERS                               */
/* -------------------------------------------------------------------------- */

function sanitizeSearch(input: string): string {
  const STOP_WORDS = new Set([
    'experience',
    'experiences',
    'exp',
    'and',
    'dev',
    'year',
    'years',
    'yr',
    'yrs',
    'skilled',
    'expert',
    'expertise',
    'with',
    'in',
    'of',
    'developer',
    'developers',
    'engineer',
    'engineers',
    'software',
    'frontend',
    'backend',
    'fullstack',
    'the',
  ]);

  return input
    .toLowerCase()
    .replace(/[&|!:()]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w))
    .join(' ');
}

/* -------------------------------------------------------------------------- */
/*                               GET CANDIDATES                               */
/* -------------------------------------------------------------------------- */

export const getCandidates = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const rawSearch = String(req.query.search || '');
    const searchTerm = sanitizeSearch(rawSearch);

    const tokens = rawSearch
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const minExperience = req.query.minExperience
      ? Number(req.query.minExperience)
      : null;
    const maxExperience = req.query.maxExperience
      ? Number(req.query.maxExperience)
      : null;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const userId = (req as any).user?.userid || (req as any).user?.id;
    const role = (req as any).user?.role?.toLowerCase();

    // Visibility restriction for Leads, Recruiters and Vendors
    if (role === 'lead') {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM resumes r_vis 
          JOIN users u_vis ON r_vis.uploaded_by = u_vis.userid
          WHERE r_vis.candidate_id = c.candidate_id 
          AND (r_vis.uploaded_by = $${paramIndex} OR u_vis.created_by = $${paramIndex})
        )
      `);
      params.push(userId);
      paramIndex++;
    } else if (role !== 'admin' && userId) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM resumes r_vis 
          WHERE r_vis.candidate_id = c.candidate_id 
          AND r_vis.uploaded_by = $${paramIndex}
        )
      `);
      params.push(userId);
      paramIndex++;
    }

    /* ----------------------------- SEARCH FILTER ----------------------------- */
    if (rawSearch.trim()) {
      const likeParam = paramIndex;
      const hasFts = !!searchTerm;
      const tsParam = hasFts ? paramIndex + 1 : null;

      const tokenClauses: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const p = likeParam + 1 + (hasFts ? 1 : 0) + i;
        tokenClauses.push(`(
          c.full_name ILIKE $${p}
          OR c.email ILIKE $${p}
          OR c.current_designation ILIKE $${p}
          OR c.current_company ILIKE $${p}
          OR c.location ILIKE $${p}
          OR EXISTS (
            SELECT 1 FROM unnest(coalesce(c.skills, ARRAY[]::text[])) s WHERE s ILIKE $${p}
          )
        )`);
      }

      conditions.push(`
        (
          (
            ${hasFts
          ? `(
            setweight(to_tsvector('english', coalesce(c.full_name, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(c.current_designation, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(c.current_company, '')), 'B') ||
            setweight(
              to_tsvector(
                'english',
                array_to_string(coalesce(c.skills, ARRAY[]::text[]), ' ')
              ),
              'B'
            ) ||
            setweight(to_tsvector('english', coalesce(c.location, '')), 'C')
          ) @@ websearch_to_tsquery('english', $${tsParam})
          OR`
          : ''}
            c.email ILIKE $${likeParam}
            OR c.full_name ILIKE $${likeParam}
            OR c.current_designation ILIKE $${likeParam}
            OR EXISTS (
              SELECT 1 FROM unnest(coalesce(c.skills, ARRAY[]::text[])) s WHERE s ILIKE $${likeParam}
            )
            ${tokens.length > 1 ? `
            OR (
              ${tokenClauses.join('\n              AND\n              ')}
            )` : ''}
          )
        )
      `);

      params.push(`%${rawSearch.trim()}%`);
      if (hasFts) {
        params.push(searchTerm);
        paramIndex += 2;
      } else {
        paramIndex += 1;
      }

      if (tokens.length > 1) {
        for (const t of tokens) {
          params.push(`%${t}%`);
        }
        paramIndex += tokens.length;
      }
    }

    /* --------------------------- EXPERIENCE FILTERS --------------------------- */
    if (minExperience !== null) {
      conditions.push(`c.total_experience >= $${paramIndex}`);
      params.push(minExperience);
      paramIndex++;
    }

    if (maxExperience !== null) {
      conditions.push(`c.total_experience <= $${paramIndex}`);
      params.push(maxExperience);
      paramIndex++;
    }

    /* ----------------------------- BASE QUERY ----------------------------- */
    let baseQuery = `
      SELECT
        c.*,
        COUNT(r.resume_id) AS resume_count,
        MAX(r.processing_status) AS latest_resume_status,
        (
          SELECT COALESCE(NULLIF(TRIM(u.name), ''), u.email, 'Unknown')
          FROM resumes r2
          JOIN users u ON u.userid = r2.uploaded_by
          WHERE r2.candidate_id = c.candidate_id
            AND r2.uploaded_by IS NOT NULL
          ORDER BY r2.uploaded_at DESC NULLS LAST
          LIMIT 1
        ) AS uploaded_by_name,
        (
          SELECT u.role
          FROM resumes r2
          JOIN users u ON u.userid = r2.uploaded_by
          WHERE r2.candidate_id = c.candidate_id
            AND r2.uploaded_by IS NOT NULL
          ORDER BY r2.uploaded_at DESC NULLS LAST
          LIMIT 1
        ) AS uploaded_by_role,
        ${searchTerm
        ? `
          ts_rank(
            setweight(to_tsvector('english', coalesce(c.full_name, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(c.current_designation, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(c.current_company, '')), 'B') ||
            setweight(
              to_tsvector(
                'english',
                array_to_string(coalesce(c.skills, ARRAY[]::text[]), ' ')
              ),
              'B'
            ) ||
            setweight(to_tsvector('english', coalesce(c.location, '')), 'C'),
            websearch_to_tsquery('english', $2)
          ) AS fts_rank
        `
        : '0 AS fts_rank'
      }
      FROM candidates c
      LEFT JOIN resumes r ON c.candidate_id = r.candidate_id
    `;

    if (conditions.length > 0) {
      baseQuery += ` WHERE ${conditions.join(' AND ')}`;
    }

    baseQuery += ` GROUP BY c.candidate_id`;

    /* ----------------------------- FINAL QUERY ----------------------------- */
    let finalQuery = `
      SELECT *
      FROM (${baseQuery}) ranked
    `;

    if (searchTerm) {
      finalQuery += ` ORDER BY ranked.fts_rank DESC, ranked.created_at DESC`;
    } else {
      finalQuery += ` ORDER BY ranked.created_at DESC`;
    }

    finalQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit);
    params.push(offset);

    const result = await pool.query(finalQuery, params);

    /* ----------------------------- COUNT QUERY ----------------------------- */
    let countQuery = `
      SELECT COUNT(DISTINCT c.candidate_id)
      FROM candidates c
    `;

    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }

    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total: Number(countResult.rows[0].count),
        totalPages: Math.ceil(Number(countResult.rows[0].count) / limit)
      }
    });
  } catch (error) {
    console.error('Get candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
};

/* -------------------------------------------------------------------------- */
/*                               GET CANDIDATE BY ID                          */
/* -------------------------------------------------------------------------- */

export const getCandidateById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userid || (req as any).user?.id;
    const role = (req as any).user?.role?.toLowerCase();

    // Base query
    let query = `SELECT * FROM candidates WHERE candidate_id = $1`;
    const params = [id];

    // Visibility restriction
    if (role === 'lead') {
      query = `
        SELECT c.* 
        FROM candidates c
        WHERE c.candidate_id = $1
          AND EXISTS (
            SELECT 1 FROM resumes r_vis 
            JOIN users u_vis ON r_vis.uploaded_by = u_vis.userid
            WHERE r_vis.candidate_id = c.candidate_id 
            AND (r_vis.uploaded_by = $2 OR u_vis.created_by = $2)
          )
      `;
      params.push(userId);
    } else if (role !== 'admin' && userId) {
      query = `
        SELECT c.* 
        FROM candidates c
        WHERE c.candidate_id = $1
          AND EXISTS (
            SELECT 1 FROM resumes r_vis 
            WHERE r_vis.candidate_id = c.candidate_id 
            AND r_vis.uploaded_by = $2
          )
      `;
      params.push(userId);
    }

    const candidateResult = await pool.query(query, params);

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found or access denied' });
    }

    const resumesResult = await pool.query(
      `
      SELECT *
      FROM resumes
      WHERE candidate_id = $1
      ORDER BY uploaded_at DESC
      `,
      [id]
    );

    const matchesResult = await pool.query(
      `
      SELECT m.*, j.title AS job_title, j.company AS job_company
      FROM candidate_job_matches m
      LEFT JOIN jobs j ON m.job_id = j.job_id
      WHERE m.candidate_id = $1
      ORDER BY m.overall_score DESC
      LIMIT 10
      `,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...candidateResult.rows[0],
        resumes: resumesResult.rows,
        job_matches: matchesResult.rows
      }
    });
  } catch (error) {
    console.error('Get candidate error:', error);
    res.status(500).json({ error: 'Failed to fetch candidate' });
  }
};

/* -------------------------------------------------------------------------- */
/*                               CREATE CANDIDATE                             */
/* -------------------------------------------------------------------------- */

export const createCandidate = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = (req as any).user?.userid || (req as any).user?.id;
    const role = (req as any).user?.role?.toLowerCase();

    if (role !== 'admin' && role !== 'recruiter' && role !== 'vendor' && role !== 'lead') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not allowed to create candidate' });
    }

    let {
      full_name,
      email,
      phone,
      location,
      linkedin_url,
      github_url,
      portfolio_url,
      gender,
      current_designation,
      current_company,
      total_experience,
      deployment_type,
      availability,
      country,
      city,
      primary_skills,
      secondary_skills,
      skills,
      parsed_json,
      resume_id // Optional: to link an existing resume to this new candidate
    } = req.body;

    if (!full_name || !email || !phone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Full Name, Email and Phone are mandatory' });
    }

    // Check if candidate already exists
    const existing = await client.query('SELECT candidate_id FROM candidates WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Candidate with this email already exists' });
    }

    if (typeof parsed_json === 'string') {
      try {
        parsed_json = JSON.parse(parsed_json);
      } catch {
        parsed_json = null;
      }
    }

    const candidateRes = await client.query(
      `INSERT INTO candidates (
        full_name, email, phone, location,
        linkedin_url, github_url, portfolio_url,
        gender, current_designation, current_company,
        total_experience, deployment_type, availability,
        country, city, primary_skills, secondary_skills,
        skills, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING *`,
      [
        full_name, email, phone, location,
        linkedin_url, github_url, portfolio_url,
        gender, current_designation, current_company,
        total_experience, deployment_type, availability,
        country, city, primary_skills, secondary_skills,
        skills
      ]
    );

    const candidate = candidateRes.rows[0];

    // Link resume if resume_id is provided
    if (resume_id) {
      await client.query(
        `UPDATE resumes SET candidate_id = $1, parsed_json = $2, processing_status = 'completed', updated_at = NOW() WHERE resume_id = $3`,
        [candidate.candidate_id, parsed_json || {}, resume_id]
      );
    }

    await client.query('COMMIT');

    // Notify all admins about the new candidate - REMOVED per user request
    /*
    try {
    }
    */

    res.status(201).json({
      success: true,
      message: 'Candidate created successfully',
      data: candidate
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create candidate error:', error);
    res.status(500).json({ error: 'Failed to create candidate' });
  } finally {
    client.release();
  }
};

/* -------------------------------------------------------------------------- */
/*                               UPDATE CANDIDATE                             */
/* -------------------------------------------------------------------------- */

export const updateCandidate = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const userId = (req as any).user?.userid || (req as any).user?.id;
    const role = (req as any).user?.role?.toLowerCase();

    if (role !== 'admin' && role !== 'recruiter' && role !== 'vendor' && role !== 'lead') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not allowed to update candidate' });
    }

    // Visibility check for Leads
    if (role === 'lead') {
      const accessCheck = await client.query(
        `SELECT 1 FROM resumes r_vis 
         JOIN users u_vis ON r_vis.uploaded_by = u_vis.userid
         WHERE r_vis.candidate_id = $1 
         AND (r_vis.uploaded_by = $2 OR u_vis.created_by = $2)`,
        [id, userId]
      );
      if (accessCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied: You can only update candidates managed by you' });
      }
    } else if (role !== 'admin' && userId) {
      const accessCheck = await client.query(
        `SELECT 1 FROM resumes WHERE candidate_id = $1 AND uploaded_by = $2`,
        [id, userId]
      );
      if (accessCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied: You can only update candidates you uploaded' });
      }
    }

    let {
      full_name,
      email,
      phone,
      location,
      linkedin_url,
      github_url,
      portfolio_url,
      gender,
      current_designation,
      current_company,
      total_experience,
      deployment_type,
      availability,
      country,
      city,
      primary_skills,
      secondary_skills,
      skills,
      parsed_json
    } = req.body;

    if (typeof parsed_json === 'string') {
      try {
        parsed_json = JSON.parse(parsed_json);
      } catch {
        parsed_json = null;
      }
    }

    const candidateRes = await client.query(
      `UPDATE candidates SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        location = COALESCE($4, location),
        linkedin_url = COALESCE($5, linkedin_url),
        github_url = COALESCE($6, github_url),
        portfolio_url = COALESCE($7, portfolio_url),
        gender = COALESCE($8, gender),
        current_designation = COALESCE($9, current_designation),
        current_company = COALESCE($10, current_company),
        total_experience = COALESCE($11, total_experience),
        deployment_type = COALESCE($12, deployment_type),
        availability = COALESCE($13, availability),
        country = COALESCE($14, country),
        city = COALESCE($15, city),
        primary_skills = COALESCE($16, primary_skills),
        secondary_skills = COALESCE($17, secondary_skills),
        skills = COALESCE($18, skills),
        updated_at = NOW()
      WHERE candidate_id = $19
      RETURNING *`,
      [
        full_name,
        email,
        phone,
        location,
        linkedin_url,
        github_url,
        portfolio_url,
        gender,
        current_designation,
        current_company,
        total_experience,
        deployment_type,
        availability,
        country,
        city,
        primary_skills,
        secondary_skills,
        skills,
        id
      ]
    );

    if (candidateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Candidate not found' });
    }

    if (parsed_json && Object.keys(parsed_json).length > 0) {
      const resumeRes = await client.query(
        `SELECT resume_id
         FROM resumes
         WHERE candidate_id = $1
         ORDER BY uploaded_at DESC NULLS LAST, created_at DESC NULLS LAST
         LIMIT 1`,
        [id]
      );

      if (resumeRes.rows.length > 0) {
        await client.query(
          `UPDATE resumes
           SET parsed_json = $1, updated_at = NOW()
           WHERE resume_id = $2`,
          [parsed_json, resumeRes.rows[0].resume_id]
        );
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Candidate updated successfully',
      data: candidateRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update candidate error:', error);
    res.status(500).json({ error: 'Failed to update candidate' });
  } finally {
    client.release();
  }
};

/* -------------------------------------------------------------------------- */
/*                               DELETE CANDIDATE                             */
/* -------------------------------------------------------------------------- */

export const deleteCandidate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userid || (req as any).user?.id;
    const role = (req as any).user?.role?.toLowerCase();

    if (role === 'lead') {
      const accessCheck = await pool.query(
        `SELECT 1 FROM resumes r_vis 
         JOIN users u_vis ON r_vis.uploaded_by = u_vis.userid
         WHERE r_vis.candidate_id = $1 
         AND (r_vis.uploaded_by = $2 OR u_vis.created_by = $2)`,
        [id, userId]
      );
      if (accessCheck.rowCount === 0) {
        return res.status(403).json({ error: 'Access denied: You can only delete candidates managed by you' });
      }
    } else if (role !== 'admin') {
      // Recruiters/Vendors can only delete if they uploaded it
      const accessCheck = await pool.query(
        `SELECT 1 FROM resumes WHERE candidate_id = $1 AND uploaded_by = $2`,
        [id, userId]
      );
      if (accessCheck.rowCount === 0) {
        return res.status(403).json({ error: 'Access denied: You can only delete candidates you uploaded' });
      }
    }

    const result = await pool.query(
      'DELETE FROM candidates WHERE candidate_id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete candidate error:', error);
    res.status(500).json({ error: 'Failed to delete candidate' });
  }
};

/* -------------------------------------------------------------------------- */
/*                               CANDIDATE STATS                              */
/* -------------------------------------------------------------------------- */

export const getCandidateStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userid || (req as any).user?.id;
    const role = (req as any).user?.role?.toLowerCase();

    let visibilityClause = '';
    const params: any[] = [];
    if (role === 'lead') {
      visibilityClause = `
        WHERE EXISTS (
          SELECT 1 FROM resumes r_vis 
          JOIN users u_vis ON r_vis.uploaded_by = u_vis.userid
          WHERE r_vis.candidate_id = candidates.candidate_id 
          AND (r_vis.uploaded_by = $1 OR u_vis.created_by = $1)
        )
      `;
      params.push(userId);
    } else if (role !== 'admin' && userId) {
      visibilityClause = `
        WHERE EXISTS (
          SELECT 1 FROM resumes r_vis 
          WHERE r_vis.candidate_id = candidates.candidate_id 
          AND r_vis.uploaded_by = $1
        )
      `;
      params.push(userId);
    }

    const stats = await pool.query(`
      SELECT 
        COUNT(*) AS total_candidates,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS new_this_week,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) AS new_this_month,
        AVG(total_experience) AS avg_experience
      FROM candidates
      ${visibilityClause}
    `, params);

    const skillStats = await pool.query(`
      SELECT skill, COUNT(*) AS count
      FROM candidates,
      LATERAL unnest(skills) AS skill
      GROUP BY skill
      ORDER BY count DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      data: {
        overview: stats.rows[0],
        top_skills: skillStats.rows
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
