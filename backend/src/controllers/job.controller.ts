// src/controllers/job.controller.ts

import { Request, Response } from "express";
import { pool } from "../lib/database";
import jobAssignmentService from "../services/job-assignment.service";
import notificationService from "../services/notification.service";
import { aiWorkerService } from "../services/ai-worker.service";

export const AI_CANDIDATES_FOR_JOB_SQL = `
      SELECT
          cand.candidate_id,
          cand.full_name,
          cand.email,
          cand.phone,
          cand.total_experience_years,
          cand.current_designation,
          cand.skills,
          COALESCE(
            NULLIF(
              COALESCE(
                r.parsed_json->>'experience_summary',
                r.parsed_json->>'experience',
                r.parsed_json->>'work_experience'
              ),
              ''
            ),
            ''
          ) AS experience_summary,

          COALESCE(MAX(1 - (j_resp.embedding <=> c_exp.embedding)), 0) AS experience_score,
          COALESCE(MAX(1 - (j_skill.embedding <=> c_skill.embedding)), 0) AS skills_score,

          COALESCE(
            CARDINALITY(
              ARRAY(
                SELECT unnest(cand.skills::text[])
                INTERSECT
                SELECT unnest(j.skills::text[])
              )
            ),
            0
          ) AS overlap_count,

          CASE
            WHEN COALESCE(CARDINALITY(j.skills::text[]), 0) = 0 THEN 0
            ELSE (
              COALESCE(
                CARDINALITY(
                  ARRAY(
                    SELECT unnest(cand.skills::text[])
                    INTERSECT
                    SELECT unnest(j.skills::text[])
                  )
                ),
                0
              )::double precision / GREATEST(CARDINALITY(j.skills::text[]), 1)
            )
          END AS overlap_ratio,

          LEAST(
            1,
            COALESCE(
              CARDINALITY(
                ARRAY(
                  SELECT unnest(cand.skills::text[])
                  INTERSECT
                  SELECT unnest(j.skills::text[])
                )
              ),
              0
            )::double precision / 5
          ) AS skill_overlap_boost,

          (
              0.5 * COALESCE(MAX(1 - (j_skill.embedding <=> c_skill.embedding)), 0) +
              0.3 * COALESCE(MAX(1 - (j_resp.embedding <=> c_exp.embedding)), 0) +
              0.2 * LEAST(
                1,
                COALESCE(
                  CARDINALITY(
                    ARRAY(
                      SELECT unnest(cand.skills::text[])
                      INTERSECT
                      SELECT unnest(j.skills::text[])
                    )
                  ),
                  0
                )::double precision / 5
              )
          ) AS final_score,

          CASE
            WHEN (
              0.5 * COALESCE(MAX(1 - (j_skill.embedding <=> c_skill.embedding)), 0) +
              0.3 * COALESCE(MAX(1 - (j_resp.embedding <=> c_exp.embedding)), 0) +
              0.2 * LEAST(
                1,
                COALESCE(
                  CARDINALITY(
                    ARRAY(
                      SELECT unnest(cand.skills::text[])
                      INTERSECT
                      SELECT unnest(j.skills::text[])
                    )
                  ),
                  0
                )::double precision / 5
              )
            ) >= 0.75 THEN 'Strong'
            WHEN (
              0.5 * COALESCE(MAX(1 - (j_skill.embedding <=> c_skill.embedding)), 0) +
              0.3 * COALESCE(MAX(1 - (j_resp.embedding <=> c_exp.embedding)), 0) +
              0.2 * LEAST(
                1,
                COALESCE(
                  CARDINALITY(
                    ARRAY(
                      SELECT unnest(cand.skills::text[])
                      INTERSECT
                      SELECT unnest(j.skills::text[])
                    )
                  ),
                  0
                )::double precision / 5
              )
            ) >= 0.55 THEN 'Good'
            ELSE 'Partial'
          END AS fit_label

      FROM candidates cand
      JOIN jobs j
        ON j.job_id = $1

      LEFT JOIN resumes r
        ON r.candidate_id = cand.candidate_id
       AND r.job_id = $1

      LEFT JOIN candidate_embeddings c_exp
        ON cand.candidate_id = c_exp.candidate_id
       AND c_exp.section = 'resume_experience'

      LEFT JOIN candidate_embeddings c_skill
        ON cand.candidate_id = c_skill.candidate_id
       AND c_skill.section = 'resume_skills'

      LEFT JOIN job_section_embeddings j_resp
        ON j_resp.job_id = $1
       AND j_resp.section = 'responsibilities'

      LEFT JOIN job_section_embeddings j_skill
        ON j_skill.job_id = $1
       AND j_skill.section = 'skills'

      WHERE
        -- Only filter by experience, not location (AI matching should be location-agnostic)
        (
          j.min_experience_years IS NULL
          OR cand.total_experience_years >= j.min_experience_years
        )

      GROUP BY cand.candidate_id, cand.full_name, cand.email, cand.phone, cand.total_experience_years, cand.current_designation, cand.skills, r.parsed_json, j.job_id, j.skills

      HAVING
          -- Allow all candidates to be ranked, prioritize those with embeddings via scoring.
          TRUE

      ORDER BY final_score DESC
      LIMIT 25;
      `;

export async function computeAiCandidatesForJob(jobId: number) {
  console.log('[AI-RANKING] Executing SQL query for job', jobId);
  const result = await pool.query(AI_CANDIDATES_FOR_JOB_SQL, [jobId]);
  console.log('[AI-RANKING] SQL returned', result.rows?.length || 0, 'rows');

  if (result.rows?.length > 0) {
    console.log('[AI-RANKING] Sample row:', JSON.stringify(result.rows[0], null, 2));
  }

  return (result.rows || []).map((r: any) => ({
    candidate_id: Number(r.candidate_id),
    full_name: String(r.full_name || ""),
    email: String(r.email || ""),
    phone: r.phone ? String(r.phone) : "",
    total_experience_years: Number(r.total_experience_years) || 0,
    current_designation: r.current_designation ? String(r.current_designation) : "",
    skills: Array.isArray(r.skills) ? r.skills.map(String) : [],
    experience_summary: r.experience_summary ? String(r.experience_summary) : "",
    experience_score: Number(r.experience_score) || 0,
    skills_score: Number(r.skills_score) || 0,
    final_score: Number(r.final_score) || 0,
    fit_label: r.fit_label ? String(r.fit_label) : "",
  })).slice(0, 10); // Return top 10
}

/**
 * Extract safe user from token
 */
const getUserFromReq = (req: any) => {
  const u = req.user || {};
  return {
    id: u.userid ?? u.id ?? null,
    role: (u.role || "").toLowerCase(),
  };
};


/**
 * ================================================================
 * CREATE JOB (FINAL WORKING VERSION)
 * ================================================================
 */
export const createJob = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    console.log("🔥 Incoming payload:", req.body);

    const {
      title,
      company,
      description,
      requirements,
      skills,
      location,
      employment_type,
      experience_level,
      salary_min,
      salary_max,
      benefits,
      remote_option,
      recruiterId,
      client_id,
      organization_id,

      // NEW: specific user assignments
      assigned_vendors = [],
      assigned_recruiters = [],

      assignment_type, // "specific" | "vendor" | "recruiter" | "all"
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        error: "Missing required fields: title, company, description",
      });
    }

    const { id: userId } = getUserFromReq(req);

    // Ensure organization_id is always set (jobs.organization_id is NOT NULL)
    let orgId: number | null = Number(organization_id);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      orgId = null;
    }

    if (!orgId) {
      try {
        // Some schemas have users.organization_id
        const orgRes = await client.query(
          `
          SELECT organization_id
          FROM users
          WHERE userid = $1
          LIMIT 1
          `,
          [userId]
        );
        const maybe = Number(orgRes.rows?.[0]?.organization_id);
        if (Number.isFinite(maybe) && maybe > 0) {
          orgId = maybe;
        }
      } catch {
        // ignore if column/table differs
      }
    }

    // Fallback for single-org setups
    if (!orgId) {
      orgId = 1;
    }

    await client.query("BEGIN");

    // Generate job_code
    const seq = await client.query(`SELECT nextval('job_code_seq') AS num`);
    const jobCode = `AT${seq.rows[0].num}`;

    /**
     * Determine final assignment mode
     */
    let finalAssignmentType = assignment_type;
    let finalSpecificUsers: number[] = [];

    // If admin selected specific vendors or recruiters → force "specific"
    if (assigned_vendors.length > 0 || assigned_recruiters.length > 0) {
      finalAssignmentType = "specific";
      finalSpecificUsers = [
        ...assigned_vendors.map(Number),
        ...assigned_recruiters.map(Number),
      ].filter((x) => Number(x) > 0);
    }

    /**
     * Insert job
     */
    const jobRes = await client.query(
      `
      INSERT INTO jobs (
        organization_id,
        title, company, client_id, description, requirements, skills,
        location, employment_type, experience_level,
        salary_min, salary_max, benefits, remote_option,
        posted_by, status, posted_date, assignment_type, job_code
      )
      VALUES (
        $1,
        $2,$3,$4,$5,$6,$7,
        $8,$9,$10,
        $11,$12,$13,$14,
        $15,'active',NOW(),$16,$17
      )
      RETURNING *
      `,
      [
        orgId,
        title,
        company,
        client_id || null,
        description,
        requirements,
        skills,
        location,
        employment_type,
        experience_level,
        salary_min,
        salary_max,
        benefits,
        remote_option,
        recruiterId || userId,
        finalAssignmentType,
        jobCode,
      ]
    );

    const job = jobRes.rows[0];

    // Clear old assignments
    await client.query(`DELETE FROM job_assignments WHERE job_id = $1`, [
      job.job_id,
    ]);

    const notifications: any[] = [];

    /**
     * ================================================================
     * 1️⃣ — SPECIFIC USERS (vendor or recruiter)
     * ================================================================
     */
    if (finalAssignmentType === "specific") {
      for (const uid of finalSpecificUsers) {
        const r = await client.query(
          `SELECT role FROM users WHERE userid = $1`,
          [uid]
        );
        const role = (r.rows[0]?.role || "vendor").toLowerCase();

        await client.query(
          `
          INSERT INTO job_assignments
          (job_id, assigned_to_user_id, assigned_by, assignment_type, status)
          VALUES ($1,$2,$3,$4,'active')
        `,
          [job.job_id, uid, userId, role]
        );

        notifications.push({
          userId: uid,
          title: "New Job Assigned",
          message: `You have been assigned job "${title}". Job Code: ${jobCode}`,
          type: "info",
        });
      }
    }

    /**
     * ================================================================
     * 2️⃣ — ALL VENDORS ONLY
     * ================================================================
     */
    if (assignment_type === "vendor") {
      await client.query(
        `
        INSERT INTO job_assignments
        (job_id, assigned_to_user_id, assigned_by, assignment_type, status)
        VALUES ($1, NULL, $2, 'vendor', 'active')
      `,
        [job.job_id, userId]
      );

      const vendors = await pool.query(
        `SELECT userid FROM users WHERE role='vendor' AND status='active'`
      );

      vendors.rows.forEach((v) =>
        notifications.push({
          userId: v.userid,
          title: "New Vendor Job",
          message: `A vendor job "${title}" is available. Code: ${jobCode}`,
          type: "info",
        })
      );
    }

    /**
     * ================================================================
     * 3️⃣ — ALL RECRUITERS ONLY
     * ================================================================
     */
    if (assignment_type === "recruiter") {
      await client.query(
        `
        INSERT INTO job_assignments
        (job_id, assigned_to_user_id, assigned_by, assignment_type, status)
        VALUES ($1,NULL,$2,'recruiter','active')
      `,
        [job.job_id, userId]
      );

      const rec = await pool.query(
        `SELECT userid FROM users WHERE role='recruiter' AND status='active'`
      );

      rec.rows.forEach((r) =>
        notifications.push({
          userId: r.userid,
          title: "New Recruiter Job",
          message: `Recruiter job "${title}" is available. Code: ${jobCode}`,
          type: "info",
        })
      );
    }

    /**
     * ================================================================
     * 4️⃣ — ALL (both vendors + recruiters)
     * ================================================================
     */
    if (assignment_type === "all") {
      // vendor visibility
      await client.query(
        `
        INSERT INTO job_assignments
        (job_id, assigned_to_user_id, assigned_by, assignment_type, status)
        VALUES ($1,NULL,$2,'vendor','active')
      `,
        [job.job_id, userId]
      );

      // recruiter visibility
      await client.query(
        `
        INSERT INTO job_assignments
        (job_id, assigned_to_user_id, assigned_by, assignment_type, status)
        VALUES ($1,NULL,$2,'recruiter','active')
      `,
        [job.job_id, userId]
      );

      const all = await pool.query(
        `SELECT userid FROM users WHERE (role='vendor' OR role='recruiter') AND status='active'`
      );

      all.rows.forEach((u) =>
        notifications.push({
          userId: u.userid,
          title: "New Job Available",
          message: `A new job "${title}" is available. Code: ${jobCode}`,
          type: "info",
        })
      );
    }

    await client.query("COMMIT");

    // Fire-and-forget: generate/refresh job embeddings (pgvector)
    try {
      void aiWorkerService.embedJob(Number(job.job_id));
    } catch (e) {
      console.warn("⚠️ embedJob trigger failed (createJob)", e);
    }

    try {
      await notificationService.sendBulkNotifications(notifications);
    } catch { }

    return res.status(201).json({
      success: true,
      message: "Job created successfully",
      data: job,
    });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => { });
    console.error("❌ Job error:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

export const getAiCandidatesForJob = async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.job_id || req.params.id);
    const forceRefreshRaw = String((req.query as any)?.forceRefresh ?? '').toLowerCase();
    const forceRefresh = forceRefreshRaw === '1' || forceRefreshRaw === 'true' || forceRefreshRaw === 'yes';
    console.log('[AI-RANKING] Diagnostic: handler entered for job', jobId);

    if (!jobId || Number.isNaN(jobId)) {
      return res.status(400).json({ error: "job_id must be a valid number" });
    }

    if (forceRefresh) {
      try {
        await pool.query(`DELETE FROM job_recommendations WHERE job_id = $1`, [jobId]);
      } catch (e) {
        console.warn('[AI-RANKING] forceRefresh: failed to clear job_recommendations', e);
      }
      try {
        await pool.query(`DELETE FROM job_candidate_matches WHERE job_id = $1`, [jobId]);
      } catch (e) {
        console.warn('[AI-RANKING] forceRefresh: failed to clear job_candidate_matches', e);
      }
    }

    // First, check if we have recommendations already computed
    const cached = await pool.query(
      `
      SELECT
        candidate_id,
        final_score,
        recommendation_score_bucket as fit_label
      FROM job_recommendations
      WHERE job_id = $1
      ORDER BY final_score DESC
      LIMIT 25;
      `,
      [jobId]
    );

    console.log('[AI-RANKING] Found', cached.rows?.length || 0, 'cached recommendations');

    if (!forceRefresh && cached.rows?.length) {
      const ids = cached.rows.map((r: any) => Number(r.candidate_id)).filter((id: number) => id > 0);
      const scoreById = new Map<number, any>();
      for (const r of cached.rows) {
        scoreById.set(Number(r.candidate_id), {
          final_score: Number(r.final_score) || 0,
          fit_label: String(r.fit_label || 'cold'),
        });
      }

      if (!ids.length) {
        return res.json({ success: true, data: [] });
      }

      const details = await pool.query(
        `
        SELECT
          cand.candidate_id,
          cand.full_name,
          cand.email,
          cand.phone,
          cand.total_experience_years,
          cand.current_designation,
          cand.skills,
          COALESCE(
            NULLIF(
              COALESCE(
                r.parsed_json->>'experience_summary',
                r.parsed_json->>'experience',
                r.parsed_json->>'work_experience'
              ),
              ''
            ),
            ''
          ) AS experience_summary
        FROM candidates cand
        LEFT JOIN resumes r
          ON r.candidate_id = cand.candidate_id
         AND r.job_id = $1
        WHERE cand.candidate_id = ANY($2::int[]);
        `,
        [jobId, ids]
      );

      const data = (details.rows || [])
        .map((r: any) => {
          const cid = Number(r.candidate_id);
          const scores = scoreById.get(cid) || {
            final_score: 0,
            fit_label: 'cold',
          };
          return {
            candidate_id: cid,
            full_name: String(r.full_name || ""),
            email: String(r.email || ""),
            phone: r.phone ? String(r.phone) : "",
            total_experience_years: Number(r.total_experience_years) || 0,
            current_designation: r.current_designation ? String(r.current_designation) : "",
            skills: Array.isArray(r.skills) ? r.skills.map(String) : [],
            experience_summary: r.experience_summary ? String(r.experience_summary) : "",
            final_score: scores.final_score,
            fit_label: scores.fit_label,
          };
        })
        .sort((a: any, b: any) => (Number(b.final_score) || 0) - (Number(a.final_score) || 0));

      return res.json({
        success: true,
        data,
      });
    }

    console.log('[AI-RANKING] No cached results, computing fresh matches...');
    let data = await computeAiCandidatesForJob(jobId);
    console.log('[AI-RANKING] computeAiCandidatesForJob returned:', data?.length || 0, 'candidates');

    // Use Gemini to re-rank candidates if API key is available
    if (Array.isArray(data) && data.length > 0) {
      try {
        console.log('[GEMINI-RANKING] Attempting to re-rank with Gemini...');

        // Get job details for Gemini
        const jobDetails = await pool.query(
          `SELECT title, description, skills, experience_level FROM jobs WHERE job_id = $1`,
          [jobId]
        );

        if (jobDetails.rows.length > 0) {
          const job = jobDetails.rows[0];

          // Call Python worker's Gemini ranking service
          const geminiResponse = await fetch('http://localhost:8001/gemini-rank', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              job_data: {
                title: job.title,
                description: job.description,
                skills: job.skills,
                experience_level: job.experience_level
              },
              candidates: data.slice(0, 20),  // Send top 20 to Gemini
              top_k: 10
            })
          });

          if (geminiResponse.ok) {
            const geminiResult: any = await geminiResponse.json();
            if (geminiResult.success && geminiResult.ranked_candidates) {
              console.log('[GEMINI-RANKING] Successfully re-ranked with Gemini');
              data = geminiResult.ranked_candidates;
            }
          } else {
            console.log('[GEMINI-RANKING] Gemini ranking not available, using embedding scores');
          }
        }
      } catch (geminiError) {
        console.error('[GEMINI-RANKING] Gemini re-ranking step failed:', geminiError);
        // Continue with original data
      }
    }

    if (Array.isArray(data) && data.length) {
      const candidateIds: number[] = [];
      const experienceScores: number[] = [];
      const skillsScores: number[] = [];
      const finalScores: number[] = [];

      for (const m of data as any[]) {
        const candidateId = Number(m?.candidate_id);
        if (!Number.isFinite(candidateId) || candidateId <= 0) continue;
        candidateIds.push(candidateId);
        experienceScores.push(Number(m?.experience_score) || 0);
        skillsScores.push(Number(m?.skills_score) || 0);
        finalScores.push(Number(m?.final_score) || 0);
      }

      if (candidateIds.length) {
        try {
          // Insert into job_candidate_matches (legacy table)
          await pool.query(
            `
            INSERT INTO job_candidate_matches (
              organization_id,
              job_id,
              candidate_id,
              experience_score,
              skills_score,
              education_score,
              projects_score,
              final_score,
              model_version,
              match_source,
              matched_at
            )
            SELECT
              j.organization_id,
              $1::int AS job_id,
              m.candidate_id,
              m.experience_score,
              m.skills_score,
              NULL::double precision AS education_score,
              NULL::double precision AS projects_score,
              m.final_score,
              'ai-candidates-v1'::text AS model_version,
              'manual'::text AS match_source,
              NOW() AS matched_at
            FROM jobs j
            JOIN (
              SELECT
                *
              FROM unnest(
                $2::int[],
                $3::double precision[],
                $4::double precision[],
                $5::double precision[]
              ) AS u(candidate_id, experience_score, skills_score, final_score)
            ) m ON TRUE
            WHERE j.job_id = $1
            ON CONFLICT (job_id, candidate_id)
            DO UPDATE SET
              final_score = EXCLUDED.final_score,
              matched_at = NOW();
            `,
            [jobId, candidateIds, experienceScores, skillsScores, finalScores]
          );
        } catch (matchError) {
          console.error('[AI-RANKING] Failed to sync job_candidate_matches:', matchError);
        }


        try {
          // ALSO insert into job_recommendations table (new table for UI)
          console.log('[AI-RANKING] Inserting', candidateIds.length, 'recommendations into job_recommendations');
          await pool.query(
            `
            INSERT INTO job_recommendations (
              job_id,
              candidate_id,
              final_score,
              skills_score,
              experience_score,
              recommendation_score_bucket,
              recommendation_status
            )
            SELECT
              $1::int AS job_id,
              m.candidate_id,
              m.final_score,
              m.skills_score,
              m.experience_score,
              CASE
                WHEN m.final_score >= 0.75 THEN 'strong'
                WHEN m.final_score >= 0.55 THEN 'good'
                WHEN m.final_score >= 0.35 THEN 'partial'
                ELSE 'cold'
              END AS recommendation_score_bucket,
              'new' AS recommendation_status
            FROM unnest(
              $2::int[],
              $3::double precision[],
              $4::double precision[],
              $5::double precision[]
            ) AS m(candidate_id, final_score, skills_score, experience_score)
            ON CONFLICT (job_id, candidate_id)
            DO UPDATE SET
              final_score = EXCLUDED.final_score,
              skills_score = EXCLUDED.skills_score,
              experience_score = EXCLUDED.experience_score,
              recommendation_score_bucket = EXCLUDED.recommendation_score_bucket,
              recommended_at = NOW();
            `,
            [jobId, candidateIds, finalScores, skillsScores, experienceScores]
          );
          console.log('[AI-RANKING] Successfully inserted recommendations');
        } catch (recError) {
          console.error('[AI-RANKING] Failed to sync job_recommendations:', recError);
        }
      }
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("AI candidates error:", error);
    return res.status(500).json({ error: "Failed to fetch AI candidates" });
  }
};

/**
 * ================================================================
 * GET JOBS
 * ================================================================
 */
export const getJobs = async (req: Request, res: Response) => {
  try {
    const { id: userId, role: userRole } = getUserFromReq(req);

    const pageRaw = Number((req.query as any)?.page);
    const limitRaw = Number((req.query as any)?.limit);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(50, Math.floor(limitRaw)) : 10;
    const offset = (page - 1) * limit;

    if (userRole === "vendor" || userRole === "recruiter") {
      const jobs = await jobAssignmentService.getJobsForUser(userId, userRole);
      const total = Array.isArray(jobs) ? jobs.length : 0;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const slice = Array.isArray(jobs) ? jobs.slice(offset, offset + limit) : [];
      return res.json({
        success: true,
        data: slice,
        pagination: { page, limit, total, totalPages },
      });
    }

    let countQuery = `SELECT COUNT(*)::int AS total FROM jobs j`;
    let params: any[] = [];

    if (userRole === 'lead') {
      countQuery += ` LEFT JOIN users u ON j.posted_by = u.userid WHERE j.posted_by = $1 OR u.created_by = $1`;
      params.push(userId);
    }

    const countRes = await pool.query(countQuery, params);
    const total = Number(countRes.rows?.[0]?.total) || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    let queryParams: any[] = [limit, offset];
    let whereClause = '';
    if (userRole === 'lead') {
      whereClause = ` WHERE j.posted_by = $3 OR u.created_by = $3 `;
      queryParams.push(userId);
    }

    const all = await pool.query(
      `
      SELECT j.*, 
             u.email AS posted_by_name,
             c.client_name,
             c.client_id,
             COUNT(a.application_id) AS application_count,
             COUNT(a.application_id) AS total_applicants
      FROM jobs j
      LEFT JOIN users u ON u.userid = j.posted_by
      LEFT JOIN clients c ON c.client_id = j.client_id
      LEFT JOIN applications a 
             ON a.job_id = j.job_id
      ${whereClause}
      GROUP BY j.job_id, u.email, c.client_id, c.client_name
      ORDER BY posted_date DESC
      LIMIT $1 OFFSET $2
      `,
      queryParams
    );

    return res.json({
      success: true,
      data: all.rows,
      pagination: { page, limit, total, totalPages },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ================================================================
 * ASSIGN JOB (Admin → recruiters / vendors)
 * ================================================================
 * POST /api/jobs/:id/assign
 * Body: { role: 'recruiter' | 'vendor', user_ids: number[] }
 */
export const assignJob = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const jobId = Number(req.params.id || req.params.jobId);
    const { role, user_ids } = req.body as {
      role?: string;
      user_ids?: number[];
    };

    if (!jobId || !Array.isArray(user_ids)) {
      return res.status(400).json({ error: "Invalid job id or user_ids" });
    }

    const normalizedRole = String(role || "").toLowerCase();
    if (normalizedRole !== "recruiter" && normalizedRole !== "vendor") {
      return res.status(400).json({ error: "role must be 'recruiter' or 'vendor'" });
    }

    const { id: adminId } = getUserFromReq(req as any);

    await client.query("BEGIN");

    // Ensure job exists and is active
    const jobRes = await client.query(
      `SELECT job_id, title, status, job_code FROM jobs WHERE job_id = $1`,
      [jobId]
    );

    if (!jobRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Job not found" });
    }

    const job = jobRes.rows[0];
    if (String(job.status || "").toLowerCase() !== "active") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Only active jobs can be assigned" });
    }

    const safeUserIds = user_ids.map((id) => Number(id)).filter((id) => id > 0);

    // First cancel ALL existing specific assignments for this job + role
    await client.query(
      `
      UPDATE job_assignments
      SET status = 'cancelled'
      WHERE job_id = $1
        AND assignment_type = $2
        AND assigned_to_user_id IS NOT NULL
      `,
      [jobId, normalizedRole]
    );

    const notifications: any[] = [];

    // Then insert/refresh active assignments for each selected user
    for (const uid of safeUserIds) {
      await client.query(
        `
        INSERT INTO job_assignments (
          job_id,
          assigned_to_user_id,
          assigned_by,
          assignment_type,
          status
        )
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (job_id, assigned_to_user_id)
        DO UPDATE SET
          assignment_type = EXCLUDED.assignment_type,
          status = 'active',
          assigned_by = EXCLUDED.assigned_by
        `,
        [jobId, uid, adminId, normalizedRole]
      );

      notifications.push({
        userId: uid,
        title: "New Job Assigned",
        message: `You have been assigned job "${job.title}". Job Code: ${job.job_code}`,
        type: "info",
      });
    }

    await client.query("COMMIT");

    try {
      if (notifications.length) {
        await notificationService.sendBulkNotifications(notifications);
      }
    } catch { }

    return res.json({
      success: true,
      message: "Job assignments updated",
      data: { job_id: jobId, role: normalizedRole, user_ids: safeUserIds },
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("❌ assignJob error:", err);
    return res.status(500).json({ error: err.message || "Failed to assign job" });
  } finally {
    client.release();
  }
};

/**
 * ================================================================
 * GET JOB BY ID
 * ================================================================
 */
export const getJobById = async (req: Request, res: Response) => {
  try {
    const { id: userId, role: userRole } = getUserFromReq(req);
    const id = Number(req.params.id || req.params.jobId);

    let query = `SELECT j.* FROM jobs j`;
    let params: any[] = [id];

    if (userRole === 'lead') {
      query += ` LEFT JOIN users u ON j.posted_by = u.userid WHERE j.job_id = $1 AND (j.posted_by = $2 OR u.created_by = $2)`;
      params.push(userId);
    } else {
      query += ` WHERE j.job_id = $1`;
    }

    const job = await pool.query(query, params);

    if (!job.rows.length)
      return res.status(404).json({ error: "Job not found or access denied" });
    // ── Compute job's final_score from its own embeddings ──────────────
    // Strategy: cosine similarity between the job's "description" and
    // "skills" section embeddings.  A well-written JD whose description
    // and skills are semantically aligned will score close to 1.0.
    // If only one section exists we use its self-similarity (= 1.0).
    // If no embeddings exist at all we fall back to 1.0 (baseline).
    let jobScore = 1.0;

    try {
      const embResult = await pool.query<{ section: string; embedding: number[] }>(
        `SELECT section, embedding::text
         FROM job_section_embeddings
         WHERE job_id = $1
         ORDER BY section`,
        [id]
      );

      if (embResult.rows.length >= 2) {
        // Helper: parse postgres vector string "[0.1,0.2,…]" → number[]
        const parseVec = (raw: any): number[] => {
          if (Array.isArray(raw)) return raw.map(Number);
          if (typeof raw === 'string') {
            return raw.replace(/[\[\]]/g, '').split(',').map(Number);
          }
          return [];
        };

        // Cosine similarity between two vectors
        const cosine = (a: number[], b: number[]): number => {
          let dot = 0, na = 0, nb = 0;
          for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
          }
          if (na === 0 || nb === 0) return 0;
          return dot / (Math.sqrt(na) * Math.sqrt(nb));
        };

        // Average pairwise cosine similarity across all section pairs
        const vecs = embResult.rows.map(r => parseVec(r.embedding)).filter(v => v.length > 0);
        let totalSim = 0, pairs = 0;
        for (let i = 0; i < vecs.length; i++) {
          for (let j = i + 1; j < vecs.length; j++) {
            totalSim += cosine(vecs[i], vecs[j]);
            pairs++;
          }
        }

        if (pairs > 0) {
          // Map cosine similarity (-1…1) → 0…1 range
          const avgCosine = totalSim / pairs;
          jobScore = (avgCosine + 1) / 2;
        }
      } else if (embResult.rows.length === 1) {
        // Only one section → self-similarity is 1.0 (perfect)
        jobScore = 1.0;
      }
      // else: no embeddings → keep default 1.0
    } catch (scoreErr) {
      console.error('[getJobById] Error computing job score:', scoreErr);
      // Keep default 1.0 on any error
    }

    return res.json({
      success: true,
      data: { ...job.rows[0], final_score: Number(jobScore.toFixed(4)) },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ================================================================
 * UPDATE JOB
 * ================================================================
 */
export const updateJob = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id || req.params.jobId);

    const fields = [
      "title",
      "company",
      "description",
      "requirements",
      "skills",
      "location",
      "employment_type",
      "experience_level",
      "salary_min",
      "salary_max",
      "benefits",
      "remote_option",
      "status",
    ];

    const updates = [];
    const values: any[] = [];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        values.push(req.body[f]);
        updates.push(`${f} = $${values.length}`);
      }
    });

    values.push(id);

    const result = await pool.query(
      `
      UPDATE jobs
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE job_id = $${values.length}
      RETURNING *
    `,
      values
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "Job not found" });

    // Fire-and-forget: refresh job embeddings (pgvector)
    try {
      void aiWorkerService.embedJob(Number(id));
    } catch (e) {
      console.warn("⚠️ embedJob trigger failed (updateJob)", e);
    }

    return res.json({
      success: true,
      message: "Job updated",
      data: result.rows[0],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ================================================================
 * DELETE JOB
 * ================================================================
 */
export const deleteJob = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id || req.params.jobId);

    const result = await pool.query(
      `DELETE FROM jobs WHERE job_id = $1 RETURNING *`,
      [id]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "Job not found" });

    return res.json({ success: true, message: "Job deleted" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export default {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
  assignJob,
  getAiCandidatesForJob,
};
