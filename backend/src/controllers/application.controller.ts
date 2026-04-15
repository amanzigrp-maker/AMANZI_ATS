/**
 * Application Controller - Handles job applications (candidate and vendor)
 */
import { Request, Response } from "express";
import { pool } from "../lib/database";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import notificationService from "../services/notification.service";

/**
 * Apply for a job as a vendor
 */
export const applyAsVendor = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const { jobId } = req.params;
    const { cover_letter, proposed_candidates } = req.body;

    const vendorId = req.user?.id;
    const vendorRole = req.user?.role?.toLowerCase();

    console.log("🔥 Vendor Apply Request User Object:", req.user);
    console.log("🧩 Vendor Apply Debug:", { vendorId, vendorRole, jobId });

    if (!vendorId) {
      return res
        .status(401)
        .json({ error: "Unauthorized: Vendor ID not found in token" });
    }

    if (vendorRole !== "vendor") {
      return res.status(403).json({ error: "Only vendors can apply for jobs" });
    }

    // Check if job exists and is active
    const jobResult = await client.query(
      "SELECT * FROM jobs WHERE job_id = $1 AND status = $2",
      [jobId, "active"]
    );

    if (jobResult.rowCount === 0) {
      return res.status(404).json({ error: "Job not found or not active" });
    }

    // Prevent duplicate applications
    const existing = await client.query(
      "SELECT 1 FROM applications WHERE job_id = $1 AND vendor_id = $2",
      [jobId, vendorId]
    );

    console.log("🔍 Duplicate check:", {
      jobId,
      vendorId,
      existingCount: existing.rowCount,
    });

    if (existing.rowCount > 0) {
      console.log("❌ Duplicate application detected");
      return res
        .status(400)
        .json({ error: "You have already applied for this job" });
    }

    await client.query("BEGIN");

    // Insert vendor application
    const insertResult = await client.query(
      `
      INSERT INTO applications (
        job_id,
        vendor_id,
        application_type,
        status,
        cover_letter,
        proposed_candidates,
        applied_date
      )
      VALUES ($1, $2, 'vendor', 'vendor_applied', $3, $4, NOW())
      RETURNING *;
      `,
      [
        jobId,
        vendorId,
        cover_letter || null,
        JSON.stringify(proposed_candidates || []),
      ]
    );

    console.log("✅ Application inserted:", {
      applicationId: insertResult.rows[0].application_id,
      jobId: insertResult.rows[0].job_id,
      vendorId: insertResult.rows[0].vendor_id,
      status: insertResult.rows[0].status,
    });

    await client.query("COMMIT");

    // Notify all admins that a new application was received for this job
    try {
      const jobRow = jobResult.rows[0];
      const jobCode: string | null = jobRow?.job_code ?? null;

      const admins = await pool.query(
        `SELECT userid FROM users WHERE role = 'admin' AND status = 'active'`
      );

      if (admins.rows.length > 0) {
        const notifications = admins.rows.map((a) => ({
          userId: a.userid as number,
          title: "New Application Received",
          message: `1 new application for job ${jobCode ?? jobId}`,
          type: "info" as const,
          relatedJobId: Number(jobId),
          relatedJobCode: jobCode ?? undefined,
          relatedEntityType: "application",
          relatedEntityId: insertResult.rows[0].application_id as number,
        }));

        await notificationService.sendBulkNotifications(notifications);
      }
    } catch (notifyErr) {
      console.error("⚠️ Failed to send admin application notification:", notifyErr);
    }

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: insertResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Vendor application error:", error);
    return res.status(500).json({
      error: "Failed to submit application",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    client.release();
  }
};

/**
 * Link an existing candidate to a job by creating an application row
 * POST /api/applications/jobs/:jobId/link-candidate
 */
export const linkCandidateToJob = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const { jobId } = req.params;
    const { candidateId } = req.body as { candidateId?: number };
    const userId = req.user?.id;

    if (!jobId || !candidateId) {
      return res.status(400).json({ error: "jobId and candidateId are required" });
    }

    // Ensure job exists
    const jobResult = await client.query("SELECT job_id FROM jobs WHERE job_id = $1", [jobId]);
    if (jobResult.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Prevent duplicate candidate applications for same job
    const existing = await client.query(
      "SELECT application_id FROM applications WHERE job_id = $1 AND candidate_id = $2",
      [jobId, candidateId]
    );

    if (existing.rowCount > 0) {
      return res.status(200).json({
        success: true,
        message: "Application already exists for this candidate and job",
        application_id: existing.rows[0].application_id,
        duplicate: true,
      });
    }

    await client.query("BEGIN");

    const insertResult = await client.query(
      `
      INSERT INTO applications (
        job_id,
        candidate_id,
        application_type,
        status,
        applied_date,
        uploaded_by_user_id
      )
      VALUES ($1, $2, 'candidate', 'pending', NOW(), $3)
      RETURNING *;
      `,
      [jobId, candidateId, userId ?? null]
    );

    await client.query("COMMIT");

    // Notify all admins that a new application was received for this job
    try {
      const jobRowRes = await client.query("SELECT job_code FROM jobs WHERE job_id = $1", [jobId]);
      const jobCode = jobRowRes.rows[0]?.job_code || jobId;

      const admins = await pool.query(
        `SELECT userid FROM users WHERE role = 'admin' AND status = 'active'`
      );

      if (admins.rows.length > 0) {
        const notifications = admins.rows.map((a) => ({
          userId: a.userid as number,
          title: "New Application Received",
          message: `New candidate linked to job ${jobCode}`,
          type: "info" as const,
          relatedJobId: Number(jobId),
          relatedJobCode: jobCode,
          relatedEntityType: "application",
          relatedEntityId: insertResult.rows[0].application_id as number,
        }));

        await notificationService.sendBulkNotifications(notifications);
      }
    } catch (notifyErr) {
      console.error("⚠️ Failed to send admin link-candidate notification:", notifyErr);
    }

    return res.status(201).json({
      success: true,
      message: "Candidate linked to job successfully",
      data: insertResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Link candidate to job error:", error);
    return res.status(500).json({
      error: "Failed to link candidate to job",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    client.release();
  }
};

/**
 * Get full details for a single application including parsed candidate + resume info
 * GET /api/applications/:applicationId/details
 */
export const getApplicationDetails = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const role = req.user?.role?.toLowerCase();
    const userId = req.user?.id;

    if (!applicationId) {
      return res.status(400).json({ error: "Application ID is required" });
    }

    // Base query to join application, candidate and latest resume
    let visibilityClause = "";
    const params: any[] = [applicationId];

    if (role === "recruiter" || role === "vendor") {
      // Restrict recruiters/vendors to applications for jobs assigned/visible to them
      visibilityClause = `
        AND EXISTS (
          SELECT 1
          FROM job_assignments ja
          WHERE ja.job_id = a.job_id
            AND ja.status = 'active'
            AND (
              (ja.assigned_to_user_id = $2)
              OR (ja.assigned_to_user_id IS NULL AND ja.assignment_type = $3)
              OR (ja.assigned_to_user_id IS NULL AND ja.assignment_type = 'all')
            )
        )
      `;
      const assignmentType = role === "recruiter" ? "recruiter" : "vendor";
      params.push(userId, assignmentType);
    } else if (role === "lead") {
      // Lead sees applications associated with themselves or users they created
      visibilityClause = `
        AND (
          a.uploaded_by_user_id = $2
          OR a.vendor_id = $2
          OR EXISTS (
            SELECT 1 FROM users u_sub 
            WHERE u_sub.userid = COALESCE(a.uploaded_by_user_id, a.vendor_id)
            AND u_sub.created_by = $2
          )
        )
      `;
      params.push(userId);
    } else if (role !== "admin") {
      return res.status(403).json({ error: "Not allowed to view application details" });
    }

    const query = `
      SELECT 
        a.application_id,
        a.job_id,
        a.candidate_id,
        a.application_type,
        a.status,
        a.applied_date,
        a.notes,

        c.full_name,
        c.email,
        c.phone,
        c.location,
        c.gender,
        c.designation,
        c.total_experience,
        c.deployment_type,
        c.availability,
        c.country,
        c.city,
        c.primary_skills,
        c.secondary_skills,

        r.resume_id,
        r.original_filename,
        r.parsed_json
      FROM applications a
      LEFT JOIN candidates c ON a.candidate_id = c.candidate_id
      LEFT JOIN LATERAL (
        SELECT resume_id, original_filename, parsed_json
        FROM resumes r
        WHERE r.candidate_id = a.candidate_id
        ORDER BY processed_at DESC NULLS LAST, resume_id DESC
        LIMIT 1
      ) r ON TRUE
      WHERE a.application_id = $1
      ${visibilityClause}
    `;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Application not found or not visible" });
    }

    const row = result.rows[0];
    let parsedJson: any = null;
    if (row.parsed_json) {
      try {
        parsedJson = typeof row.parsed_json === "string" ? JSON.parse(row.parsed_json) : row.parsed_json;
      } catch {
        parsedJson = null;
      }
    }

    return res.json({
      success: true,
      data: {
        application_id: row.application_id,
        job_id: row.job_id,
        candidate_id: row.candidate_id,
        application_type: row.application_type,
        status: row.status,
        applied_date: row.applied_date,
        notes: row.notes,
        candidate: {
          full_name: row.full_name,
          email: row.email,
          phone: row.phone,
          location: row.location,
          gender: row.gender,
          designation: row.designation,
          total_experience: row.total_experience,
          deployment_type: row.deployment_type,
          availability: row.availability,
          country: row.country,
          city: row.city,
          primary_skills: row.primary_skills,
          secondary_skills: row.secondary_skills,
          experience: parsedJson?.experience || [],
          projects: parsedJson?.projects || [],
          education: parsedJson?.education || [],
        },
        resume: row.resume_id
          ? {
            resume_id: row.resume_id,
            original_filename: row.original_filename,
            parsed_json: parsedJson || {},   // <-- include parsed_json
          }
          : null,

      },
    });
  } catch (error) {
    console.error("❌ Get application details error:", error);
    return res.status(500).json({
      error: "Failed to fetch application details",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get vendor's applications (UPDATED)
 */
export const getVendorApplications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = req.user?.id;
    const vendorRole = req.user?.role;

    if (!vendorId || vendorRole?.toLowerCase() !== "vendor") {
      return res
        .status(403)
        .json({ error: "Unauthorized: Only vendors can access this data" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    let query = `
      SELECT 
        a.application_id,
        a.job_id,
        a.status,
        a.notes,
        a.applied_date AS submitted_at,

        -- Job details (UI Needs These Exact Names)
        j.title AS job_title,
        j.company AS company_name,
        j.job_code,

        -- Extra (not required but kept)
        j.posted_date,
        u.email AS posted_by_email
      FROM applications a
      JOIN jobs j ON a.job_id = j.job_id
      JOIN users u ON j.posted_by = u.userid
      WHERE a.vendor_id = $1 
        AND a.application_type = 'vendor'
    `;

    const params: any[] = [vendorId];

    if (status) {
      query += ` AND a.status = $2`;
      params.push(status);
    }

    query += ` 
      ORDER BY a.applied_date DESC 
      LIMIT $${params.length + 1} 
      OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM applications WHERE vendor_id = $1 AND application_type = 'vendor'`,
      [vendorId]
    );

    const total = parseInt(countResult.rows[0].count, 10);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get vendor applications error:", error);
    return res.status(500).json({
      error: "Failed to fetch applications",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get all job applications (admin only)
 */
export const getJobApplications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const role = req.user?.role?.toLowerCase();
    const userId = req.user?.id;

    console.log("🔍 Fetching applications:", jobId, "Role:", role, "User:", userId);

    // Admin can always see all applications; recruiter/vendor have strict visibility rules
    let visibilityClause = '';
    let params: any[] = [jobId];

    if (role === 'admin') {
      // no extra filters
    } else if (role === 'lead') {
      // Lead sees 1) their own uploads, 2) their own vendor submissions, 
      // or 3) those submitted/uploaded by users they created
      visibilityClause = `
        AND (
          a.uploaded_by_user_id = $2 
          OR a.vendor_id = $2
          OR EXISTS (
            SELECT 1 FROM users u_sub 
            WHERE u_sub.userid = COALESCE(a.uploaded_by_user_id, a.vendor_id)
            AND u_sub.created_by = $2
          )
        )
      `;
      params.push(userId);
    } else if (role === 'vendor') {
      visibilityClause = `
        AND a.application_type = 'vendor'
        AND a.vendor_id = $2
      `;
      params.push(userId);
    } else if (role === 'recruiter') {
      // Recruiter sees only applications created by this recruiter (uploaded_by_user_id)
      // or resumes uploaded by this recruiter (fallback for legacy rows)
      visibilityClause = `
        AND (
          (
            (a.application_type IS NULL OR a.application_type != 'vendor')
            AND a.uploaded_by_user_id = $2
          )
          OR EXISTS (
            SELECT 1
            FROM resumes r3
            WHERE r3.job_id = a.job_id
              AND r3.candidate_id = COALESCE(a.candidate_id, pc.candidate_id)
              AND r3.uploaded_by = $2
          )
        )
      `;
      params.push(userId);
    } else {
      console.log('❌ Access denied - unsupported role');
      return res.status(403).json({ error: 'Not allowed to view job applications' });
    }

    const result = await pool.query(
      `
      SELECT
        a.*, 
        COALESCE(a_cand.status, a.status) AS display_status,
        CASE 
          WHEN a.application_type = 'vendor' THEN c.email
          WHEN a.application_type = 'candidate' THEN c.email
        END AS applicant_email,
        CASE 
          WHEN a.application_type = 'vendor' THEN COALESCE(c.full_name, u.email)
          WHEN a.application_type = 'candidate' THEN c.full_name
        END AS applicant_name,
        c.full_name AS candidate_name,
        c.current_designation AS candidate_title,
        c.skills AS candidate_skills,
        r.resume_id AS resume_id,
        r.uploaded_at AS resume_uploaded_at,
        uploader.name AS uploaded_by_name,
        uploader.email AS uploaded_by_email,
        uploader.role AS uploaded_by_role
      FROM applications a
      LEFT JOIN users uploader ON uploader.userid = a.uploaded_by_user_id
      LEFT JOIN users u ON a.vendor_id = u.userid
      -- For vendor applications, expand proposed_candidates into candidate rows
      LEFT JOIN LATERAL (
        SELECT (jsonb_array_elements_text(COALESCE(a.proposed_candidates, '[]'::jsonb)))::int AS candidate_id
      ) pc ON (a.application_type = 'vendor')
      LEFT JOIN candidates c ON c.candidate_id = COALESCE(a.candidate_id, pc.candidate_id)
      LEFT JOIN applications a_cand
        ON a_cand.job_id = a.job_id
       AND a_cand.candidate_id = COALESCE(a.candidate_id, pc.candidate_id)
       AND (a_cand.application_type IS NULL OR a_cand.application_type != 'vendor')
      LEFT JOIN LATERAL (
        SELECT r2.resume_id, r2.uploaded_at
        FROM resumes r2
        WHERE r2.job_id = a.job_id
          AND r2.candidate_id = COALESCE(a.candidate_id, pc.candidate_id)
        ORDER BY r2.uploaded_at DESC NULLS LAST, r2.resume_id DESC
        LIMIT 1
      ) r ON TRUE
      WHERE a.job_id = $1
      ${visibilityClause}
      ORDER BY a.applied_date DESC, a.application_id DESC
      `,
      params
    );

    console.log("✅ Found applications:", result.rowCount);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("❌ Get job applications error:", error);
    return res.status(500).json({
      error: "Failed to fetch job applications",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Update application status (admin only)
 */
export const updateApplicationStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const { status, notes } = req.body;
    const role = req.user?.role;

    if (role?.toLowerCase() !== "admin" && role?.toLowerCase() !== "lead" && role?.toLowerCase() !== "recruiter") {
      return res
        .status(403)
        .json({ error: "Only admins, leads, and recruiters can update application status" });
    }

    const result = await pool.query(
      `
      UPDATE applications
      SET status = $1, notes = $2, updated_at = NOW()
      WHERE application_id = $3
      RETURNING *
      `,
      [status, notes, applicationId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Application not found" });
    }

    return res.json({
      success: true,
      message: "Application status updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Update application status error:", error);
    return res.status(500).json({
      error: "Failed to update application status",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Check if vendor can apply for a job
 */
export const checkVendorApplyEligibility = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const vendorId = req.user?.id;
    const vendorRole = req.user?.role;

    console.log("🔍 Checking eligibility:", jobId, vendorId, vendorRole);

    if (vendorRole?.toLowerCase() !== "vendor") {
      return res.json({
        canApply: false,
        reason: "Only vendors can apply for jobs",
      });
    }

    const job = await pool.query(
      "SELECT 1 FROM jobs WHERE job_id = $1 AND status = $2",
      [jobId, "active"]
    );

    if (job.rowCount === 0) {
      return res.json({
        canApply: false,
        reason: "Job not found or not active",
      });
    }

    const existing = await pool.query(
      "SELECT status FROM applications WHERE job_id = $1 AND vendor_id = $2",
      [jobId, vendorId]
    );

    if (existing.rowCount > 0) {
      return res.json({
        canApply: false,
        reason: "Already applied",
        applicationStatus: existing.rows[0].status,
      });
    }

    return res.json({ canApply: true });
  } catch (error) {
    console.error("❌ Check vendor apply eligibility error:", error);
    return res.status(500).json({
      error: "Failed to check application eligibility",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get candidates in interview pipeline (statuses: pending, screening, interview, accepted, rejected, offered)
 * GET /api/applications/interviews
 */
export const getInterviewCandidates = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userid;
    const role = req.user?.role;
    const from = String((req as any).query?.from || '');
    const to = String((req as any).query?.to || '');
    const daysRaw = (req as any).query?.days;
    const days = daysRaw ? Number(daysRaw) : 0;

    let visibilityClause = '';
    const params: any[] = [];

    if (role === 'admin') {
      // Admin sees all
      visibilityClause = '';
    } else if (role === 'lead' && userId) {
      // Lead sees candidates THEY uploaded or candidates uploaded by users they created
      visibilityClause = `
        AND (
          a.uploaded_by_user_id = $1 
          OR a.vendor_id = $1
          OR EXISTS (
            SELECT 1 FROM users u_sub 
            WHERE u_sub.userid = COALESCE(a.uploaded_by_user_id, a.vendor_id)
            AND u_sub.created_by = $1
          )
        )
      `;
      params.push(userId);
    } else if (userId && (role === 'recruiter' || role === 'vendor')) {
      // Recruiter/Vendor: only see candidates THEY uploaded themselves or submitted
      visibilityClause = `
        AND (a.uploaded_by_user_id = $1 OR a.vendor_id = $1)
      `;
      params.push(userId);
    } else {
      // Fallback: no visibility
      visibilityClause = 'AND 1=0';
    }

    const hasDateRange =
      /^\d{4}-\d{2}-\d{2}$/.test(from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(to);

    let dateClause = '';
    if (hasDateRange) {
      dateClause = `AND a.applied_date >= $${params.length + 1}::date AND a.applied_date < ($${params.length + 2}::date + INTERVAL '1 day')`;
      params.push(from, to);
    } else if (Number.isFinite(days) && days > 0) {
      dateClause = `AND a.applied_date >= CURRENT_DATE - ($${params.length + 1}::int - 1)`;
      params.push(days);
    }

    const pipelineStatuses = [
      'profile_share',
      'screen_selected',
      'interview_l1',
      'interview_l2',
      'interview_l3',
      'rejected',
      'offered',
      'backout',
      'bg_status',
      'joined',
      'pending',
      'screening',
      'interview',
      'interview_scheduled',
      'interviewed',
      'accepted'
    ];

    const query = `
      SELECT 
        a.application_id,
        a.job_id,
        a.candidate_id,
        a.status,
        a.applied_date,
        a.notes,
        c.full_name,
        c.email,
        c.phone,
        c.current_designation,
        j.title AS job_title,
        j.company,
        COALESCE(u_upl.name, u_upl.email, u_job.name, u_job.email, '—') AS recruiter_name
      FROM applications a
      LEFT JOIN candidates c ON a.candidate_id = c.candidate_id
      LEFT JOIN jobs j ON a.job_id = j.job_id
      LEFT JOIN users u_job ON j.posted_by = u_job.userid
      LEFT JOIN users u_upl ON a.uploaded_by_user_id = u_upl.userid
      WHERE a.status = ANY($${params.length + 1})
        ${dateClause}
        ${visibilityClause}
      ORDER BY a.applied_date DESC
    `;

    const result = await client.query(query, [...params, pipelineStatuses]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get interview candidates error:', error);
    res.status(500).json({
      error: 'Failed to fetch interview candidates',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    client.release();
  }
};
