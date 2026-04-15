/**
 * Dashboard Analytics Controller - PostgreSQL based
 * Simple analytics without ClickHouse dependency
 */
import { Request, Response } from 'express';
import { pool } from '../lib/database';
import jobAssignmentService from '../services/job-assignment.service';

/**
 * Get dashboard overview statistics
 */

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();

    // Get normalized user + role from auth middleware
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = (user.role || '').toLowerCase();

    // ---- Date handling (single source of truth) ----
    const from =
      typeof req.query.from === 'string' ? req.query.from : null;
    const to =
      typeof req.query.to === 'string' ? req.query.to : null;

    // if from/to present -> ignore days
    const rawDays = parseInt(req.query.days as string, 10);
    const days =
      !from && !to && Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(rawDays, 365)
        : 0;

    try {
      let totalJobs = 0;
      let activeJobs = 0;
      let closedJobs = 0;
      let holdJobs = 0;

      if (userId && (role === 'admin')) {
        // Admin: see ALL jobs (not only those they created)
        const jobStats = await client.query(
          `
          SELECT
            COUNT(*) AS total_jobs,
            COUNT(*) FILTER (WHERE status = 'active') AS active_jobs,
            COUNT(*) FILTER (WHERE status = 'closed') AS closed_jobs,
            COUNT(*) FILTER (WHERE status = 'on hold') AS hold_jobs
          FROM jobs
        `
        );

        totalJobs = parseInt(jobStats.rows[0]?.total_jobs ?? '0', 10);
        activeJobs = parseInt(jobStats.rows[0]?.active_jobs ?? '0', 10);
        closedJobs = parseInt(jobStats.rows[0]?.closed_jobs ?? '0', 10);
        holdJobs = parseInt(jobStats.rows[0]?.hold_jobs ?? '0', 10);
      } else if (userId && role === 'lead') {
        // Lead: see jobs created by them or their under roles
        const jobStats = await client.query(
          `
          SELECT
            COUNT(*) AS total_jobs,
            COUNT(*) FILTER (WHERE jo.status = 'active') AS active_jobs,
            COUNT(*) FILTER (WHERE jo.status = 'closed') AS closed_jobs,
            COUNT(*) FILTER (WHERE jo.status = 'on hold') AS hold_jobs
          FROM jobs jo
          LEFT JOIN users u ON jo.posted_by = u.userid
          WHERE jo.posted_by = $1 OR u.created_by = $1
        `,
          [userId]
        );

        totalJobs = parseInt(jobStats.rows[0]?.total_jobs ?? '0', 10);
        activeJobs = parseInt(jobStats.rows[0]?.active_jobs ?? '0', 10);
        closedJobs = parseInt(jobStats.rows[0]?.closed_jobs ?? '0', 10);
        holdJobs = parseInt(jobStats.rows[0]?.hold_jobs ?? '0', 10);
      } else if (userId && (role === 'recruiter' || role === 'vendor')) {
        // Recruiter/Vendor: use the same visibility logic as their job list
        // so totals always match the jobs they actually see.
        const jobs = await jobAssignmentService.getJobsForUser(userId, role);
        totalJobs = Array.isArray(jobs) ? jobs.length : 0;
        activeJobs = Array.isArray(jobs)
          ? jobs.filter(
            (j: any) => String(j.status || '').toLowerCase() === 'active'
          ).length
          : 0;
        closedJobs = Array.isArray(jobs)
          ? jobs.filter(
            (j: any) => String(j.status || '').toLowerCase() === 'closed'
          ).length
          : 0;
        holdJobs = Array.isArray(jobs)
          ? jobs.filter(
            (j: any) => String(j.status || '').toLowerCase() === 'on hold'
          ).length
          : 0;
      } else {
        // Fallback: global counts (e.g. for other roles)
        const jobStats = await client.query(
          `
          SELECT
            COUNT(*) AS total_jobs,
            COUNT(*) FILTER (WHERE status = 'active') AS active_jobs,
            COUNT(*) FILTER (WHERE status = 'closed') AS closed_jobs,
            COUNT(*) FILTER (WHERE status = 'on hold') AS hold_jobs
          FROM jobs
        `
        );

        totalJobs = parseInt(jobStats.rows[0]?.total_jobs ?? '0', 10);
        activeJobs = parseInt(jobStats.rows[0]?.active_jobs ?? '0', 10);
      }

      // Total applicants - role aware
      let totalApplicants = 0;
      // Screened - role aware
      let screened = 0;
      // Interviews scheduled - role aware
      let interviewsScheduled = 0;
      // Offers extended - role aware
      let offersExtended = 0;
      // Hires (accepted applications) - role aware
      let hires = 0;

      if (role === 'admin') {
        // Admin: total applicants = total resume uploads (all users), optionally date-filtered
        let resumeDateFilter = '';
        let appDateFilter = '';
        const params: any[] = [];

        if (from && to) {
          resumeDateFilter =
            'AND r.uploaded_at >= $1::date AND r.uploaded_at < ($2::date + INTERVAL \'1 day\')';
          appDateFilter =
            'AND a.applied_date >= $1::date AND a.applied_date < ($2::date + INTERVAL \'1 day\')';
          params.push(from, to);
        } else if (days > 0) {
          resumeDateFilter =
            'AND r.uploaded_at >= CURRENT_DATE - ($1::int - 1)';
          appDateFilter =
            'AND a.applied_date >= CURRENT_DATE - ($1::int - 1)';
          params.push(days);
        }

        const resumeCount = await client.query(
          `
          SELECT COUNT(*) AS total_applicants
          FROM resumes r
          WHERE 1=1
            AND r.candidate_id IS NOT NULL
          ${resumeDateFilter}
          `,
          params
        );

        totalApplicants = parseInt(resumeCount.rows[0]?.total_applicants ?? '0', 10);

        // screened
        const screenedResult = await client.query(
          `
          SELECT COUNT(*) AS screened
          FROM applications a
          WHERE a.status IN ('screening','vendor_reviewing','review','profile_share','screen_selected')
          ${appDateFilter}
        `,
          params
        );
        screened = parseInt(screenedResult.rows[0]?.screened ?? '0', 10);

        // interviews
        const interviewsResult = await client.query(
          `
          SELECT COUNT(*) AS interviews_scheduled
          FROM applications a
          WHERE a.status IN ('interview_l1', 'interview_l2', 'interview_l3')
          ${appDateFilter}
        `,
          params
        );
        interviewsScheduled = parseInt(
          interviewsResult.rows[0]?.interviews_scheduled ?? '0',
          10
        );

        // offers
        const offersResult = await client.query(
          `
          SELECT COUNT(*) AS offers_extended
          FROM applications a
          WHERE a.status = 'offered'
          ${appDateFilter}
        `,
          params
        );
        offersExtended = parseInt(
          offersResult.rows[0]?.offers_extended ?? '0',
          10
        );

        // hires
        const hiresResult = await client.query(
          `
          SELECT COUNT(*) AS hires
          FROM applications a
          WHERE a.status IN ('accepted', 'joined')
          ${appDateFilter}
        `,
          params
        );
        hires = parseInt(hiresResult.rows[0]?.hires ?? '0', 10);
      } else if (userId && role === 'lead') {
        // Lead: see applicants from them or their under roles
        let resumeDateFilter = '';
        let appDateFilter = '';
        let params: any[] = [userId];

        if (from && to) {
          resumeDateFilter = 'AND r.uploaded_at >= $2::date AND r.uploaded_at < ($3::date + INTERVAL \'1 day\')';
          appDateFilter = 'AND a.applied_date >= $2::date AND a.applied_date < ($3::date + INTERVAL \'1 day\')';
          params = [userId, from, to];
        } else if (days > 0) {
          resumeDateFilter = 'AND r.uploaded_at >= CURRENT_DATE - ($2::int - 1)';
          appDateFilter = 'AND a.applied_date >= CURRENT_DATE - ($2::int - 1)';
          params = [userId, days];
        }

        const resumeCount = await client.query(
          `
          SELECT COUNT(*) AS total_applicants
          FROM resumes r
          LEFT JOIN users u ON u.userid = r.uploaded_by
          WHERE (r.uploaded_by = $1 OR u.created_by = $1)
            AND r.candidate_id IS NOT NULL
          ${resumeDateFilter}
          `,
          params
        );
        totalApplicants = parseInt(resumeCount.rows[0]?.total_applicants ?? '0', 10);

        const screenedResult = await client.query(
          `
          SELECT COUNT(*) AS screened
          FROM applications a
          LEFT JOIN users u ON u.userid = a.uploaded_by_user_id
          WHERE (
            a.uploaded_by_user_id = $1 
            OR u.created_by = $1 
            OR a.vendor_id = $1 
            OR a.vendor_id IN (SELECT userid FROM users WHERE created_by = $1)
          )
          AND a.status IN ('screening','vendor_reviewing','review','profile_share','screen_selected')
          ${appDateFilter}
        `,
          params
        );
        screened = parseInt(screenedResult.rows[0]?.screened ?? '0', 10);

        // similar for interviews, offers, hires...
        const interviewsResult = await client.query(
          `
          SELECT COUNT(*) AS interviews_scheduled
          FROM applications a
          LEFT JOIN users u ON u.userid = a.uploaded_by_user_id
          WHERE (
            a.uploaded_by_user_id = $1 
            OR u.created_by = $1 
            OR a.vendor_id = $1 
            OR a.vendor_id IN (SELECT userid FROM users WHERE created_by = $1)
          )
          AND a.status IN ('interview_l1', 'interview_l2', 'interview_l3')
          ${appDateFilter}
        `,
          params
        );
        interviewsScheduled = parseInt(interviewsResult.rows[0]?.interviews_scheduled ?? '0', 10);

        const offersResult = await client.query(
          `
          SELECT COUNT(*) AS offers_extended
          FROM applications a
          LEFT JOIN users u ON u.userid = a.uploaded_by_user_id
          WHERE (
            a.uploaded_by_user_id = $1 
            OR u.created_by = $1 
            OR a.vendor_id = $1 
            OR a.vendor_id IN (SELECT userid FROM users WHERE created_by = $1)
          )
          AND a.status = 'offered'
          ${appDateFilter}
        `,
          params
        );
        offersExtended = parseInt(offersResult.rows[0]?.offers_extended ?? '0', 10);

        const hiresResult = await client.query(
          `
          SELECT COUNT(*) AS hires
          FROM applications a
          LEFT JOIN users u ON u.userid = a.uploaded_by_user_id
          WHERE (
            a.uploaded_by_user_id = $1 
            OR u.created_by = $1 
            OR a.vendor_id = $1 
            OR a.vendor_id IN (SELECT userid FROM users WHERE created_by = $1)
          )
          AND a.status IN ('accepted', 'joined')
          ${appDateFilter}
        `,
          params
        );
        hires = parseInt(hiresResult.rows[0]?.hires ?? '0', 10);
      } else if (userId && role === 'vendor') {
        // Vendor: total applicants = resumes uploaded by this vendor
        let resumeDateFilter = '';
        let appDateFilter = '';
        let params: any[] = [userId];

        if (from && to) {
          resumeDateFilter =
            'AND r.uploaded_at >= $2::date AND r.uploaded_at < ($3::date + INTERVAL \'1 day\')';
          appDateFilter =
            'AND a.applied_date >= $2::date AND a.applied_date < ($3::date + INTERVAL \'1 day\')';
          params = [userId, from, to];
        } else if (days > 0) {
          resumeDateFilter = 'AND r.uploaded_at >= CURRENT_DATE - ($2::int - 1)';
          appDateFilter = 'AND a.applied_date >= CURRENT_DATE - ($2::int - 1)';
          params = [userId, days];
        }

        const resumeCount = await client.query(
          `
          SELECT COUNT(*) AS total_applicants
          FROM resumes r
          JOIN users u ON u.userid = r.uploaded_by
          WHERE r.uploaded_by = $1
            AND u.role = 'vendor'
            AND r.candidate_id IS NOT NULL
          ${resumeDateFilter}
          `,
          params
        );

        totalApplicants = parseInt(resumeCount.rows[0]?.total_applicants ?? '0', 10);

        const screenedResult = await client.query(
          `
          SELECT COUNT(*) AS screened
          FROM applications a
          WHERE a.vendor_id = $1
            AND a.status IN ('screening','vendor_reviewing','review','profile_share','screen_selected')
            ${appDateFilter}
          `,
          params
        );
        screened = parseInt(screenedResult.rows[0]?.screened ?? '0', 10);

        const interviewsResult = await client.query(
          `
          SELECT COUNT(*) AS interviews_scheduled
          FROM applications a
          WHERE a.vendor_id = $1
            AND a.status IN ('interview_l1', 'interview_l2', 'interview_l3')
            ${appDateFilter}
          `,
          params
        );
        interviewsScheduled = parseInt(interviewsResult.rows[0]?.interviews_scheduled ?? '0', 10);

        const offersResult = await client.query(
          `
          SELECT COUNT(*) AS offers_extended
          FROM applications a
          WHERE a.vendor_id = $1
            AND a.status = 'offered'
            ${appDateFilter}
          `,
          params
        );
        offersExtended = parseInt(offersResult.rows[0]?.offers_extended ?? '0', 10);

        const hiresResult = await client.query(
          `
          SELECT COUNT(*) AS hires
          FROM applications a
          WHERE a.vendor_id = $1
            AND a.status IN ('accepted', 'joined')
            ${appDateFilter}
          `,
          params
        );
        hires = parseInt(hiresResult.rows[0]?.hires ?? '0', 10);
      } else if (userId && role === 'recruiter') {
        // Recruiter: total applicants = resumes uploaded by this recruiter
        let resumeDateFilter = '';
        let appDateFilter = '';
        let params: any[] = [userId];

        if (from && to) {
          resumeDateFilter =
            'AND r.uploaded_at >= $2::date AND r.uploaded_at < ($3::date + INTERVAL \'1 day\')';
          appDateFilter =
            'AND a.applied_date >= $2::date AND a.applied_date < ($3::date + INTERVAL \'1 day\')';
          params = [userId, from, to];
        } else if (days > 0) {
          resumeDateFilter = 'AND r.uploaded_at >= CURRENT_DATE - ($2::int - 1)';
          appDateFilter = 'AND a.applied_date >= CURRENT_DATE - ($2::int - 1)';
          params = [userId, days];
        }

        const resumeCount = await client.query(
          `
          SELECT COUNT(*) AS total_applicants
          FROM resumes r
          JOIN users u ON u.userid = r.uploaded_by
          WHERE r.uploaded_by = $1
            AND u.role = 'recruiter'
            AND r.candidate_id IS NOT NULL
          ${resumeDateFilter}
          `,
          params
        );

        totalApplicants = parseInt(resumeCount.rows[0]?.total_applicants ?? '0', 10);

        const screenedResult = await client.query(
          `
          SELECT COUNT(*) AS screened
          FROM applications a
          WHERE a.status IN ('screening','vendor_reviewing','review','profile_share','screen_selected')
            AND EXISTS (
              SELECT 1
              FROM jobs j
              WHERE j.job_id = a.job_id
                AND j.posted_by = $1
            )
            ${appDateFilter}
          `,
          params
        );
        screened = parseInt(screenedResult.rows[0]?.screened ?? '0', 10);

        const interviewsResult = await client.query(
          `
          SELECT COUNT(*) AS interviews_scheduled
          FROM applications a
          WHERE a.status IN ('interview_l1', 'interview_l2', 'interview_l3')
            AND EXISTS (
              SELECT 1
              FROM jobs j
              WHERE j.job_id = a.job_id
                AND j.posted_by = $1
            )
            ${appDateFilter}
          `,
          params
        );
        interviewsScheduled = parseInt(interviewsResult.rows[0]?.interviews_scheduled ?? '0', 10);

        const offersResult = await client.query(
          `
          SELECT COUNT(*) AS offers_extended
          FROM applications a
          WHERE a.status = 'offered'
            AND EXISTS (
              SELECT 1
              FROM jobs j
              WHERE j.job_id = a.job_id
                AND j.posted_by = $1
            )
            ${appDateFilter}
          `,
          params
        );
        offersExtended = parseInt(offersResult.rows[0]?.offers_extended ?? '0', 10);

        const hiresResult = await client.query(
          `
          SELECT COUNT(*) AS hires
          FROM applications a
          WHERE a.status IN ('accepted', 'joined')
            AND EXISTS (
              SELECT 1
              FROM jobs j
              WHERE j.job_id = a.job_id
                AND j.posted_by = $1
            )
            ${appDateFilter}
          `,
          params
        );
        hires = parseInt(hiresResult.rows[0]?.hires ?? '0', 10);
      } else {
        // Fallback: all applications
        const appsResult = await client.query(
          `SELECT COUNT(*) AS total_applicants FROM applications`
        );
        totalApplicants = parseInt(
          appsResult.rows[0]?.total_applicants ?? '0',
          10
        );

        const screenedResult = await client.query(
          `
          SELECT COUNT(*) AS screened
          FROM applications
          WHERE status IN ('screening','vendor_reviewing','review','profile_share','screen_selected')
          `
        );
        screened = parseInt(screenedResult.rows[0]?.screened ?? '0', 10);

        const interviewsResult = await client.query(
          `
          SELECT COUNT(*) AS interviews_scheduled
          FROM applications
          WHERE status IN ('interview_l1', 'interview_l2', 'interview_l3')
          `
        );
        interviewsScheduled = parseInt(
          interviewsResult.rows[0]?.interviews_scheduled ?? '0',
          10
        );

        const offersResult = await client.query(
          `
          SELECT COUNT(*) AS offers_extended
          FROM applications
          WHERE status = 'offered'
          `
        );
        offersExtended = parseInt(
          offersResult.rows[0]?.offers_extended ?? '0',
          10
        );

        const hiresResult = await client.query(
          `
          SELECT COUNT(*) AS hires
          FROM applications
          WHERE status IN ('accepted', 'joined')
          `
        );
        hires = parseInt(hiresResult.rows[0]?.hires ?? '0', 10);
      }

      // Total candidates (admin sees all, leads see managed, others see none)
      let totalCandidates = 0;
      if (role === 'admin') {
        const candidatesResult = await client.query(
          `SELECT COUNT(*) AS total_candidates FROM candidates`
        );
        totalCandidates = parseInt(
          candidatesResult.rows[0]?.total_candidates ?? '0',
          10
        );
      } else if (role === 'lead') {
        const candidatesResult = await client.query(
          `
          SELECT COUNT(*) AS total_candidates 
          FROM candidates c
          WHERE EXISTS (
            SELECT 1 FROM resumes r
            LEFT JOIN users u ON u.userid = r.uploaded_by
            WHERE r.candidate_id = c.candidate_id
            AND (r.uploaded_by = $1 OR u.created_by = $1)
          )
          `,
          [userId]
        );
        totalCandidates = parseInt(
          candidatesResult.rows[0]?.total_candidates ?? '0',
          10
        );
      }

      const responseData = {
        totalJobs,
        activeJobs,
        closedJobs,
        holdJobs,
        totalApplicants,
        screened,
        interviewsScheduled,
        offersExtended,
        hires,
        totalCandidates,
      };

      console.log('Sending dashboard stats (per-user):', {
        userId,
        role,
        ...responseData,
      });

      res.json(responseData);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const getRecentApplications = async (req: Request, res: Response) => {
  try {
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = String(user.role || '').toLowerCase();

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;

    if (role === 'vendor') {
      return res.json({ success: true, data: [] });
    }

    const params: any[] = [];
    let where = `WHERE (a.application_type IS NULL OR a.application_type != 'vendor')`;

    if (role === 'recruiter' || role === 'vendor') {
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });
      const p = role === 'vendor' ? 'a.vendor_id' : 'a.uploaded_by_user_id';
      where += ` AND ${p} = $1`;
      params.push(userId);
    } else if (role === 'lead') {
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });
      where += ` AND (
        a.uploaded_by_user_id = $1 
        OR a.vendor_id = $1 
        OR EXISTS (
          SELECT 1 FROM users u_sub 
          WHERE u_sub.userid = COALESCE(a.uploaded_by_user_id, a.vendor_id)
          AND u_sub.created_by = $1
        )
      )`;
      params.push(userId);
    }

    const q = `
      SELECT
        a.application_id,
        a.job_id,
        a.candidate_id,
        a.status,
        a.applied_date,
        j.title AS job_title,
        j.job_code,
        c.candidate_code,
        c.full_name AS candidate_name,
        COALESCE(
          NULLIF(c.gender, ''),
          NULLIF(latest_r.parsed_json->>'gender', ''),
          NULLIF(latest_r.parsed_json->>'Gender', '')
        ) AS candidate_gender
      FROM applications a
      LEFT JOIN jobs j ON j.job_id = a.job_id
      LEFT JOIN candidates c ON c.candidate_id = a.candidate_id
      LEFT JOIN LATERAL (
        SELECT r.parsed_json
        FROM resumes r
        WHERE r.candidate_id = a.candidate_id
        ORDER BY r.uploaded_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.resume_id DESC
        LIMIT 1
      ) latest_r ON TRUE
      ${where}
      ORDER BY a.applied_date DESC NULLS LAST, a.application_id DESC
      LIMIT $${params.length + 1}
    `;

    params.push(limit);
    const result = await pool.query(q, params);

    const femaleFirstNames = new Set([
      'shefali',
      'charvi',
      'pooja',
      'priya',
      'neha',
      'anita',
      'kavita',
      'divya',
      'sneha',
      'shreya',
      'meena',
      'geeta',
      'sita',
      'radha',
      'laxmi',
      'lakshmi',
      'aarti',
      'aarthi',
      'rashmi',
      'rekha',
      'rani',
      'deepa',
      'jyoti',
      'swati',
      'nisha',
      'sonia',
      'kiran',
      'monika',
      'sunita',
      'nirmala',
      'bhavna',
      'bhavya',
      'ishita',
      'komal',
      'payal',
      'ritika',
      'richa',
      'tanya',
      'shweta',
      'kajal',
      'anjali',
      'pallavi',
      'preeti',
      'suman',
      'sushma',
      'madhu',
    ]);

    const rows = (result.rows || []).map((r: any) => {
      const raw = String(r?.candidate_gender ?? '').trim().toLowerCase();
      if (raw) {
        if (raw.startsWith('f')) return { ...r, candidate_gender: 'female' };
        if (raw.startsWith('m')) return { ...r, candidate_gender: 'male' };
        return r;
      }
      const name = String(r?.candidate_name ?? '').trim().toLowerCase();
      const first = name.split(/\s+/)[0] || '';
      if (femaleFirstNames.has(first)) {
        return { ...r, candidate_gender: 'female' };
      }
      return r;
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching recent applications:', error);
    return res.status(500).json({ error: 'Failed to fetch recent applications' });
  }
};

/**
 * Get pipeline trend: cumulative applicants vs interviews over a selectable timeframe.
 * Uses the same recruiter/vendor visibility semantics as getDashboardStats so
 * recruiters see only their own jobs' applicants and admins see all.
 */
export const getPipelineTrend = async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();

    // Parse timeframe params
    const rawHours = parseFloat(req.query.hours as string) || 1;
    const rawGranularity = (req.query.granularity as string) || '5m';

    // Normalize hours to a safe range
    let hours = rawHours;
    if (!Number.isFinite(hours) || hours <= 0) hours = 1;
    if (hours > 24) hours = 24;

    // Map shorthand granularity to a Postgres interval string
    const normalizeGranularity = (g: string): string => {
      const val = g.trim().toLowerCase();
      switch (val) {
        case '10s':
          return '10 seconds';
        case '30s':
          return '30 seconds';
        case '1m':
          return '1 minute';
        case '5m':
          return '5 minutes';
        case '15m':
          return '15 minutes';
        case '30m':
          return '30 minutes';
        case '1h':
          return '1 hour';
        case '2h':
          return '2 hours';
        default:
          return '5 minutes';
      }
    };

    const bucketInterval = normalizeGranularity(rawGranularity);

    const user: any = (req as any).user || {};
    const userId: number | null = user.id ?? user.userid ?? null;
    const role = (user.role || '').toLowerCase();



    try {
      const params: any[] = [];
      let resumeRoleFilter = '';
      let offerRoleFilter = '';
      let jobRoleFilter = '';

      // Total applicants must match dashboard totalApplicants: it is resumes-based.
      // Offers remain applications-based.
      if (role === 'admin' || !userId) {
        // no filters
      } else if (role === 'lead') {
        params.push(userId);
        const p = `$${params.length}`;
        resumeRoleFilter = `AND (r.uploaded_by = ${p} OR u.created_by = ${p})`;
        offerRoleFilter = `AND (a.uploaded_by_user_id = ${p} OR u.created_by = ${p} OR a.vendor_id = ${p} OR a.vendor_id IN (SELECT userid FROM users WHERE created_by = ${p}))`;
        jobRoleFilter = `AND (j.posted_by = ${p} OR u.created_by = ${p})`;
      } else if (role === 'vendor' || role === 'recruiter') {
        // dashboard totalApplicants for vendor/recruiter is based on resumes uploaded by that user
        params.push(userId);
        const p = `$${params.length}`;
        resumeRoleFilter = `AND r.uploaded_by = ${p}`;

        // offers should also be role-scoped similarly (best-effort)
        if (role === 'vendor') {
          offerRoleFilter = `AND a.application_type = 'vendor' AND a.vendor_id = ${p}`;
          jobRoleFilter = `AND EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = j.job_id AND (ja.assigned_to_user_id = ${p} OR ja.assignment_type = 'vendor'))`;
        } else {
          offerRoleFilter = `
            AND (
              (
                (a.application_type IS NULL OR a.application_type != 'vendor')
                AND a.uploaded_by_user_id = ${p}
              )
              OR EXISTS (
                SELECT 1
                FROM resumes r2
                WHERE r2.job_id = a.job_id
                  AND r2.candidate_id = a.candidate_id
                  AND r2.uploaded_by = ${p}
              )
            )
          `;
          jobRoleFilter = `AND j.posted_by = ${p}`;
        }
      }

      const query = `
        WITH buckets AS (
          SELECT generate_series(
            date_trunc('minute', NOW() - INTERVAL '${hours.toString()} hours'),
            date_trunc('minute', NOW()),
            INTERVAL '${bucketInterval}'
          ) AS bucket
        ),
        resume_events AS (
          SELECT
            date_trunc('minute', r.created_at) AS ts
          FROM resumes r
          LEFT JOIN users u ON u.userid = r.uploaded_by
          WHERE r.created_at >= (NOW() - INTERVAL '${hours.toString()} hours')
            AND r.created_at <= NOW()
            AND r.candidate_id IS NOT NULL
            ${resumeRoleFilter}
        ),
        offer_events AS (
          SELECT
            date_trunc('minute', a.updated_at) AS ts
          FROM applications a
          LEFT JOIN users u ON u.userid = a.uploaded_by_user_id
          WHERE a.status = 'offered'
            AND a.updated_at >= (NOW() - INTERVAL '${hours.toString()} hours')
            AND a.updated_at <= NOW()
            ${offerRoleFilter}
        ),
        job_events AS (
          SELECT
            date_trunc('minute', j.posted_date) AS ts
          FROM jobs j
          LEFT JOIN users u ON u.userid = j.posted_by
          WHERE j.posted_date >= (NOW() - INTERVAL '${hours.toString()} hours')
            AND j.posted_date <= NOW()
            ${jobRoleFilter}
        ),
        resume_counts AS (
          SELECT
            b.bucket,
            COUNT(r.ts) AS applicants_in_bucket
          FROM buckets b
          LEFT JOIN resume_events r
            ON r.ts <= b.bucket
          GROUP BY b.bucket
        ),
        offer_counts AS (
          SELECT
            b.bucket,
            COUNT(o.ts) AS offers_in_bucket
          FROM buckets b
          LEFT JOIN offer_events o
            ON o.ts <= b.bucket
          GROUP BY b.bucket
        ),
        job_counts AS (
          SELECT
            b.bucket,
            COUNT(j.ts) AS jobs_in_bucket
          FROM buckets b
          LEFT JOIN job_events j
            ON j.ts <= b.bucket
          GROUP BY b.bucket
        )
        SELECT
          b.bucket AS bucket,
          COALESCE(rc.applicants_in_bucket, 0) AS total_applicants,
          COALESCE(oc.offers_in_bucket, 0) AS total_offers,
          COALESCE(jc.jobs_in_bucket, 0) AS total_jobs
        FROM buckets b
        LEFT JOIN resume_counts rc ON rc.bucket = b.bucket
        LEFT JOIN offer_counts oc ON oc.bucket = b.bucket
        LEFT JOIN job_counts jc ON jc.bucket = b.bucket
        ORDER BY b.bucket;
      `;

      const result = await client.query(query, params);

      const data = result.rows.map((row) => ({
        timestamp: row.bucket,
        total_applicants: Number(row.total_applicants) || 0,
        total_offers: Number(row.total_offers) || 0,
        total_jobs: Number(row.total_jobs) || 0,
      }));

      res.json({ success: true, data, hours, granularity: bucketInterval });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get pipeline trend error:', error);
    res.status(500).json({
      error: 'Failed to fetch pipeline trend',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get resume upload trends (last 30 days)
 */
export const getUploadTrends = async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const client = await pool.connect();
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = String(user.role || '').toLowerCase();

    try {
      const params: any[] = [];
      let whereClause = `WHERE created_at >= NOW() - INTERVAL '${days.toString()} days'`;

      if (role === 'lead' && userId) {
        whereClause += ` AND (resumes.uploaded_by = $1 OR EXISTS (SELECT 1 FROM users u_sub WHERE u_sub.userid = resumes.uploaded_by AND u_sub.created_by = $1))`;
        params.push(userId);
      } else if ((role === 'recruiter' || role === 'vendor') && userId) {
        whereClause += ` AND resumes.uploaded_by = $1`;
        params.push(userId);
      }

      const trendsQuery = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM resumes
        ${whereClause}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `;

      const result = await client.query(trendsQuery, params);

      res.json({
        success: true,
        data: result.rows,
        period_days: days,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get upload trends error:', error);
    res.status(500).json({
      error: 'Failed to fetch upload trends',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get top skills from all resumes
 */
export const getTopSkills = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const client = await pool.connect();
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = String(user.role || '').toLowerCase();

    try {
      const params: any[] = [limit];
      let visibilityClause = '';

      if (role === 'lead' && userId) {
        visibilityClause = `
          AND EXISTS (
            SELECT 1 FROM resumes r_vis
            LEFT JOIN users u_sub ON u_sub.userid = r_vis.uploaded_by
            WHERE r_vis.candidate_id = candidates.candidate_id
            AND (r_vis.uploaded_by = $2 OR u_sub.created_by = $2)
          )
        `;
        params.push(userId);
      } else if ((role === 'recruiter' || role === 'vendor') && userId) {
        visibilityClause = `
          AND EXISTS (
            SELECT 1 FROM resumes r_vis
            WHERE r_vis.candidate_id = candidates.candidate_id
            AND r_vis.uploaded_by = $2
          )
        `;
        params.push(userId);
      }

      const skillsQuery = `
        SELECT 
          skill,
          COUNT(*) as count
        FROM candidates,
        LATERAL unnest(skills) as skill
        WHERE skills IS NOT NULL
        ${visibilityClause}
        GROUP BY skill
        ORDER BY count DESC
        LIMIT $1
      `;

      const result = await client.query(skillsQuery, params);

      res.json({
        success: true,
        data: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get top skills error:', error);
    res.status(500).json({
      error: 'Failed to fetch top skills',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get parsing performance metrics
 */
export const getParsingMetrics = async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = String(user.role || '').toLowerCase();

    try {
      const params: any[] = [];
      let visibilityClause = 'WHERE processed_at IS NOT NULL';

      if (role === 'lead' && userId) {
        visibilityClause += ` AND (resumes.uploaded_by = $1 OR EXISTS (SELECT 1 FROM users u_sub WHERE u_sub.userid = resumes.uploaded_by AND u_sub.created_by = $1))`;
        params.push(userId);
      } else if ((role === 'recruiter' || role === 'vendor') && userId) {
        visibilityClause += ` AND resumes.uploaded_by = $1`;
        params.push(userId);
      }

      const metricsQuery = `
        SELECT 
          processing_status,
          COUNT(*) as count,
          ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - uploaded_at))), 2) as avg_processing_time_seconds
        FROM resumes
        ${visibilityClause}
        GROUP BY processing_status
      `;

      const result = await client.query(metricsQuery, params);

      res.json({
        success: true,
        data: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get parsing metrics error:', error);
    res.status(500).json({
      error: 'Failed to fetch parsing metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get experience distribution
 */
export const getExperienceDistribution = async (
  req: Request,
  res: Response
) => {
  try {
    const client = await pool.connect();
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = String(user.role || '').toLowerCase();

    try {
      const params: any[] = [];
      let visibilityClause = 'WHERE total_experience_years IS NOT NULL';

      if (role === 'lead' && userId) {
        visibilityClause += `
          AND EXISTS (
            SELECT 1 FROM resumes r_vis
            LEFT JOIN users u_sub ON u_sub.userid = r_vis.uploaded_by
            WHERE r_vis.candidate_id = candidates.candidate_id
            AND (r_vis.uploaded_by = $1 OR u_sub.created_by = $1)
          )
        `;
        params.push(userId);
      } else if ((role === 'recruiter' || role === 'vendor') && userId) {
        visibilityClause += `
          AND EXISTS (
            SELECT 1 FROM resumes r_vis
            WHERE r_vis.candidate_id = candidates.candidate_id
            AND r_vis.uploaded_by = $1
          )
        `;
        params.push(userId);
      }

      const distributionQuery = `
        SELECT 
          CASE 
            WHEN total_experience_years < 1 THEN '0-1 years'
            WHEN total_experience_years < 3 THEN '1-3 years'
            WHEN total_experience_years < 5 THEN '3-5 years'
            WHEN total_experience_years < 10 THEN '5-10 years'
            ELSE '10+ years'
          END as experience_range,
          COUNT(*) as count
        FROM candidates
        ${visibilityClause}
        GROUP BY experience_range
        ORDER BY 
          CASE experience_range
            WHEN '0-1 years' THEN 1
            WHEN '1-3 years' THEN 2
            WHEN '3-5 years' THEN 3
            WHEN '5-10 years' THEN 4
            WHEN '10+ years' THEN 5
          END
      `;

      const result = await client.query(distributionQuery, params);

      res.json({
        success: true,
        data: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get experience distribution error:', error);
    res.status(500).json({
      error: 'Failed to fetch experience distribution',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get location distribution (top cities)
 */
export const getLocationDistribution = async (
  req: Request,
  res: Response
) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const client = await pool.connect();
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = String(user.role || '').toLowerCase();

    try {
      const params: any[] = [limit];
      let visibilityClause = 'WHERE city IS NOT NULL';

      if (role === 'lead' && userId) {
        visibilityClause += `
          AND EXISTS (
            SELECT 1 FROM resumes r_vis
            LEFT JOIN users u_sub ON u_sub.userid = r_vis.uploaded_by
            WHERE r_vis.candidate_id = candidates.candidate_id
            AND (r_vis.uploaded_by = $2 OR u_sub.created_by = $2)
          )
        `;
        params.push(userId);
      } else if ((role === 'recruiter' || role === 'vendor') && userId) {
        visibilityClause += `
          AND EXISTS (
            SELECT 1 FROM resumes r_vis
            WHERE r_vis.candidate_id = candidates.candidate_id
            AND r_vis.uploaded_by = $2
          )
        `;
        params.push(userId);
      }

      const locationQuery = `
        SELECT 
          city,
          country,
          COUNT(*) as count
        FROM candidates
        ${visibilityClause}
        GROUP BY city, country
        ORDER BY count DESC
        LIMIT $1
      `;

      const result = await client.query(locationQuery, params);

      res.json({
        success: true,
        data: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get location distribution error:', error);
    res.status(500).json({
      error: 'Failed to fetch location distribution',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get comprehensive dashboard data (all metrics)
 */
export const getCompleteDashboard = async (
  req: Request,
  res: Response
) => {
  try {
    const user: any = (req as any).user || {};
    const userId: number | null = user.userid ?? user.id ?? null;
    const role = String(user.role || '').toLowerCase();

    const [stats, trends, skills, parsing, experience, location] =
      await Promise.all([
        getDashboardStatsData(userId, role),
        getUploadTrendsData(30, userId, role),
        getTopSkillsData(20, userId, role),
        getParsingMetricsData(userId, role),
        getExperienceDistributionData(userId, role),
        getLocationDistributionData(10, userId, role),
      ]);

    res.json({
      success: true,
      data: {
        overview: stats,
        upload_trends: trends,
        top_skills: skills,
        parsing_metrics: parsing,
        experience_distribution: experience,
        location_distribution: location,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get complete dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Helper functions for getCompleteDashboard
async function getDashboardStatsData(userId: number | null, role: string) {
  const client = await pool.connect();
  try {
    let visibilityWhere = '';
    let params: any[] = [];
    if (role === 'lead' && userId) {
      visibilityWhere = `WHERE (uploaded_by = $1 OR EXISTS (SELECT 1 FROM users u_sub WHERE u_sub.userid = resumes.uploaded_by AND u_sub.created_by = $1))`;
      params.push(userId);
    } else if ((role === 'recruiter' || role === 'vendor') && userId) {
      visibilityWhere = `WHERE uploaded_by = $1`;
      params.push(userId);
    }

    const candidateVisibilityClause = role !== 'admin' && userId ? `
      WHERE EXISTS (
        SELECT 1 FROM resumes r_vis
        LEFT JOIN users u_sub ON u_sub.userid = r_vis.uploaded_by
        WHERE r_vis.candidate_id = candidates.candidate_id
        ${role === 'lead' ? 'AND (r_vis.uploaded_by = $1 OR u_sub.created_by = $1)' : 'AND r_vis.uploaded_by = $1'}
      )
    ` : '';

    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM candidates ${candidateVisibilityClause}) as total_candidates,
        (SELECT COUNT(*) FROM resumes ${visibilityWhere}) as total_resumes,
        (SELECT COUNT(*) FROM jobs ${role !== 'admin' && userId ? `WHERE posted_by = $1 OR (SELECT created_by FROM users WHERE userid = posted_by) = $1` : ''}) as total_jobs,
        (SELECT COUNT(*) FROM resumes ${visibilityWhere ? visibilityWhere + " AND processing_status = 'completed'" : "WHERE processing_status = 'completed'"}) as parsed_resumes,
        (SELECT COUNT(*) FROM resumes ${visibilityWhere ? visibilityWhere + " AND processing_status = 'failed'" : "WHERE processing_status = 'failed'"}) as failed_resumes
    `;
    const result = await client.query(statsQuery, params);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getUploadTrendsData(days: number, userId: number | null, role: string) {
  const client = await pool.connect();
  try {
    let whereClause = `WHERE created_at >= NOW() - INTERVAL '${days} days'`;
    let params: any[] = [];
    if (role === 'lead' && userId) {
      whereClause += ` AND (uploaded_by = $1 OR EXISTS (SELECT 1 FROM users u_sub WHERE u_sub.userid = resumes.uploaded_by AND u_sub.created_by = $1))`;
      params.push(userId);
    } else if ((role === 'recruiter' || role === 'vendor') && userId) {
      whereClause += ` AND uploaded_by = $1`;
      params.push(userId);
    }

    const query = `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM resumes
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getTopSkillsData(limit: number, userId: number | null, role: string) {
  const client = await pool.connect();
  try {
    let visibilityClause = '';
    let params: any[] = [limit];
    if (role === 'lead' && userId) {
      visibilityClause = `
        AND EXISTS (
          SELECT 1 FROM resumes r_vis
          LEFT JOIN users u_sub ON u_sub.userid = r_vis.uploaded_by
          WHERE r_vis.candidate_id = candidates.candidate_id
          AND (r_vis.uploaded_by = $2 OR u_sub.created_by = $2)
        )
      `;
      params.push(userId);
    } else if ((role === 'recruiter' || role === 'vendor') && userId) {
      visibilityClause = `
        AND EXISTS (
          SELECT 1 FROM resumes r_vis
          WHERE r_vis.candidate_id = candidates.candidate_id
          AND r_vis.uploaded_by = $2
        )
      `;
      params.push(userId);
    }

    const query = `
      SELECT skill, COUNT(*) as count
      FROM candidates, LATERAL unnest(skills) as skill
      WHERE skills IS NOT NULL
      ${visibilityClause}
      GROUP BY skill
      ORDER BY count DESC
      LIMIT $1
    `;
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getParsingMetricsData(userId: number | null, role: string) {
  const client = await pool.connect();
  try {
    let visibilityClause = '';
    let params: any[] = [];
    if (role === 'lead' && userId) {
      visibilityClause = ` WHERE (uploaded_by = $1 OR EXISTS (SELECT 1 FROM users u_sub WHERE u_sub.userid = resumes.uploaded_by AND u_sub.created_by = $1))`;
      params.push(userId);
    } else if ((role === 'recruiter' || role === 'vendor') && userId) {
      visibilityClause = ` WHERE uploaded_by = $1`;
      params.push(userId);
    }

    const query = `
      SELECT processing_status, COUNT(*) as count
      FROM resumes
      ${visibilityClause}
      GROUP BY processing_status
    `;
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getExperienceDistributionData(userId: number | null, role: string) {
  const client = await pool.connect();
  try {
    let visibilityClause = 'WHERE total_experience_years IS NOT NULL';
    let params: any[] = [];
    if (role === 'lead' && userId) {
      visibilityClause += `
        AND EXISTS (
          SELECT 1 FROM resumes r_vis
          LEFT JOIN users u_sub ON u_sub.userid = r_vis.uploaded_by
          WHERE r_vis.candidate_id = candidates.candidate_id
          AND (r_vis.uploaded_by = $1 OR u_sub.created_by = $1)
        )
      `;
      params.push(userId);
    } else if ((role === 'recruiter' || role === 'vendor') && userId) {
      visibilityClause += `
        AND EXISTS (
          SELECT 1 FROM resumes r_vis
          WHERE r_vis.candidate_id = candidates.candidate_id
          AND r_vis.uploaded_by = $1
        )
      `;
      params.push(userId);
    }

    const query = `
      SELECT 
        CASE 
          WHEN total_experience_years < 1 THEN '0-1 years'
          WHEN total_experience_years < 3 THEN '1-3 years'
          WHEN total_experience_years < 5 THEN '3-5 years'
          WHEN total_experience_years < 10 THEN '5-10 years'
          ELSE '10+ years'
        END as experience_range,
        COUNT(*) as count
      FROM candidates
      ${visibilityClause}
      GROUP BY experience_range
    `;
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getLocationDistributionData(limit: number, userId: number | null, role: string) {
  const client = await pool.connect();
  try {
    let visibilityClause = 'WHERE city IS NOT NULL';
    let params: any[] = [limit];
    if (role === 'lead' && userId) {
      visibilityClause += `
        AND EXISTS (
          SELECT 1 FROM resumes r_vis
          LEFT JOIN users u_sub ON u_sub.userid = r_vis.uploaded_by
          WHERE r_vis.candidate_id = candidates.candidate_id
          AND (r_vis.uploaded_by = $2 OR u_sub.created_by = $2)
        )
      `;
      params.push(userId);
    } else if ((role === 'recruiter' || role === 'vendor') && userId) {
      visibilityClause += `
        AND EXISTS (
          SELECT 1 FROM resumes r_vis
          WHERE r_vis.candidate_id = candidates.candidate_id
          AND r_vis.uploaded_by = $2
        )
      `;
      params.push(userId);
    }

    const query = `
      SELECT city, country, COUNT(*) as count
      FROM candidates
      ${visibilityClause}
      GROUP BY city, country
      ORDER BY count DESC
      LIMIT $1
    `;
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}
