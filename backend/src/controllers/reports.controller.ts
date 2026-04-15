import { Request, Response } from 'express';
import { pool } from '../lib/database';

type Role = 'admin' | 'recruiter' | 'vendor' | 'lead';

interface ResumeUploadReportRow {
  job_id: number | null;
  job_code: string;
  job_name: string;
  job_type: string;
  position: string;
  company_name: string;
  location: string;
  recruiter_name: string;
  candidate_id: number | null;
  candidate_code: string;
  candidate_name: string;
  uploading_date: string;
  status: string;
}

interface StatusUpdateReportRow {
  application_id: number;
  job_name: string;
  job_code: string;
  candidate_name: string;
  status: string;
  updated_at: string;
  recruiter_name: string;
}

interface JobPerformanceRow {
  job_id: number;
  title: string;
  job_code: string;
  client_name: string;
  location: string;
  recruiter_email: string;
  applications: number;
  interviews: number;
  offers: number;
  hires: number;
  rejected: number;
}

const buildResumeUploadReportQuery = (
  role: Role,
  userId: number,
  from: string,
  to: string
) => {
  const hasDateRange =
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to);

  const dateClause = hasDateRange
    ? `AND r.uploaded_at >= $1::date AND r.uploaded_at < ($2::date + INTERVAL '1 day')`
    : '';

  if (role === 'admin') {
    return {
      query: `
        SELECT
          r.job_id AS job_id,
          COALESCE(j.job_code, '') AS job_code,
          COALESCE(j.title, '') AS job_name,
          COALESCE(j.employment_type, '') AS job_type,
          COALESCE(j.title, '') AS position,
          COALESCE(c.client_name, j.company, '') AS company_name,
          COALESCE(j.location, '') AS location,
          COALESCE(uploader.email, 'Unknown') AS recruiter_name,
          r.candidate_id,
          COALESCE(can.candidate_code, '') AS candidate_code,
          COALESCE(can.full_name, '') AS candidate_name,
          r.uploaded_at,
          COALESCE(a.status, 'uploaded') AS status

        FROM resumes r
        LEFT JOIN candidates can ON can.candidate_id = r.candidate_id
        LEFT JOIN jobs j ON j.job_id = r.job_id
        LEFT JOIN users uploader ON uploader.userid = r.uploaded_by
        LEFT JOIN clients c ON c.client_id = j.client_id
        LEFT JOIN LATERAL (
          SELECT a2.status
          FROM applications a2
          WHERE a2.job_id = r.job_id
            AND a2.candidate_id = r.candidate_id
          ORDER BY a2.applied_date DESC NULLS LAST, a2.application_id DESC
          LIMIT 1
        ) a ON TRUE

        WHERE 1=1
        AND r.candidate_id IS NOT NULL
        ${dateClause}
        ORDER BY r.uploaded_at DESC, r.resume_id DESC;
      `,
      params: hasDateRange ? [from, to] : [],
      hasDateRange,
    };
  }

  if (role === 'lead') {
    return {
      query: `
        SELECT
          r.job_id AS job_id,
          COALESCE(j.job_code, '') AS job_code,
          COALESCE(j.title, '') AS job_name,
          COALESCE(j.employment_type, '') AS job_type,
          COALESCE(j.title, '') AS position,
          COALESCE(c.client_name, j.company, '') AS company_name,
          COALESCE(j.location, '') AS location,
          COALESCE(uploader.email, 'Unknown') AS recruiter_name,
          r.candidate_id,
          COALESCE(can.candidate_code, '') AS candidate_code,
          COALESCE(can.full_name, '') AS candidate_name,
          r.uploaded_at,
          COALESCE(a.status, 'uploaded') AS status

        FROM resumes r
        LEFT JOIN candidates can ON can.candidate_id = r.candidate_id
        LEFT JOIN jobs j ON j.job_id = r.job_id
        LEFT JOIN users uploader ON uploader.userid = r.uploaded_by
        LEFT JOIN clients c ON c.client_id = j.client_id
        LEFT JOIN LATERAL (
          SELECT a2.status
          FROM applications a2
          WHERE a2.job_id = r.job_id
            AND a2.candidate_id = r.candidate_id
          ORDER BY a2.applied_date DESC NULLS LAST, a2.application_id DESC
          LIMIT 1
        ) a ON TRUE

        WHERE 1=1
        AND r.candidate_id IS NOT NULL
        ${dateClause}
        AND (r.uploaded_by = ${hasDateRange ? '$3' : '$1'} OR uploader.created_by = ${hasDateRange ? '$3' : '$1'})
        ORDER BY r.uploaded_at DESC, r.resume_id DESC;
      `,
      params: hasDateRange ? [from, to, userId] : [userId],
      hasDateRange,
    };
  }

  if (role === 'vendor') {
    return {
      query: `
        SELECT
          r.job_id AS job_id,
          COALESCE(j.job_code, '') AS job_code,
          COALESCE(j.title, '') AS job_name,
          COALESCE(j.employment_type, '') AS job_type,
          COALESCE(j.title, '') AS position,
          COALESCE(c.client_name, j.company, '') AS company_name,
          COALESCE(j.location, '') AS location,
          COALESCE(uploader.email, 'Unknown') AS recruiter_name,
          r.candidate_id,
          COALESCE(can.candidate_code, '') AS candidate_code,
          COALESCE(can.full_name, '') AS candidate_name,
          r.uploaded_at,
          COALESCE(a.status, 'uploaded') AS status

        FROM resumes r
        LEFT JOIN candidates can ON can.candidate_id = r.candidate_id
        LEFT JOIN jobs j ON j.job_id = r.job_id
        LEFT JOIN users uploader ON uploader.userid = r.uploaded_by
        LEFT JOIN clients c ON c.client_id = j.client_id
        LEFT JOIN LATERAL (
          SELECT a2.status
          FROM applications a2
          WHERE a2.job_id = r.job_id
            AND a2.candidate_id = r.candidate_id
            AND a2.vendor_id = ${hasDateRange ? '$3' : '$1'}
          ORDER BY a2.applied_date DESC NULLS LAST, a2.application_id DESC
          LIMIT 1
        ) a ON TRUE

        WHERE 1=1
        AND r.candidate_id IS NOT NULL
        ${hasDateRange ? `AND r.uploaded_at >= $1::date AND r.uploaded_at < ($2::date + INTERVAL '1 day')` : ''}
        AND r.uploaded_by = ${hasDateRange ? '$3' : '$1'}
        ORDER BY r.uploaded_at DESC, r.resume_id DESC;
      `,
      params: hasDateRange ? [from, to, userId] : [userId],
      hasDateRange,
    };
  }

  return {
    query: `
      SELECT
        r.job_id AS job_id,
        COALESCE(j.job_code, '') AS job_code,
        COALESCE(j.title, '') AS job_name,
        COALESCE(j.employment_type, '') AS job_type,
        COALESCE(j.title, '') AS position,
        COALESCE(c.client_name, j.company, '') AS company_name,
        COALESCE(j.location, '') AS location,
        COALESCE(uploader.email, 'Unknown') AS recruiter_name,
        r.candidate_id,
        COALESCE(can.candidate_code, '') AS candidate_code,
        COALESCE(can.full_name, '') AS candidate_name,
        r.uploaded_at,
        COALESCE(a.status, 'uploaded') AS status

      FROM resumes r
      LEFT JOIN candidates can ON can.candidate_id = r.candidate_id
      LEFT JOIN jobs j ON j.job_id = r.job_id
      LEFT JOIN users uploader ON uploader.userid = r.uploaded_by
      LEFT JOIN clients c ON c.client_id = j.client_id
      LEFT JOIN LATERAL (
        SELECT a2.status
        FROM applications a2
        WHERE a2.job_id = r.job_id
          AND a2.candidate_id = r.candidate_id
          AND (a2.application_type IS NULL OR a2.application_type != 'vendor')
          AND (
            a2.uploaded_by_user_id = ${hasDateRange ? '$3' : '$1'}
            OR EXISTS (
              SELECT 1
              FROM resumes r2
              WHERE r2.job_id = a2.job_id
                AND r2.candidate_id = a2.candidate_id
                AND r2.uploaded_by = ${hasDateRange ? '$3' : '$1'}
            )
          )
        ORDER BY a2.applied_date DESC NULLS LAST, a2.application_id DESC
        LIMIT 1
      ) a ON TRUE

      WHERE 1=1
      AND r.candidate_id IS NOT NULL
      ${hasDateRange ? `AND r.uploaded_at >= $1::date AND r.uploaded_at < ($2::date + INTERVAL '1 day')` : ''}
      AND r.uploaded_by = ${hasDateRange ? '$3' : '$1'}
      ORDER BY r.uploaded_at DESC, r.resume_id DESC;
    `,
    params: hasDateRange ? [from, to, userId] : [userId],
    hasDateRange,
  };
};

const mapResumeUploadReportRows = (rows: any[]): ResumeUploadReportRow[] =>
  rows.map((r) => ({
    job_id: r.job_id ?? null,
    job_code: r.job_code || '',
    job_name: r.job_name || '',
    job_type: r.job_type || '',
    position: r.position || '',
    company_name: r.company_name || '',
    location: r.location || '',
    recruiter_name: r.recruiter_name || '',
    candidate_id: r.candidate_id ?? null,
    candidate_code: r.candidate_code || '',
    candidate_name: r.candidate_name || '',
    uploading_date: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : '',
    status: r.status || '',
  }));

const buildJobPerformanceQuery = (
  role: Role,
  userId: number,
  from: string,
  to: string
) => {
  const hasDateRange =
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to);

  let params: any[] = [];
  let query = '';

  if (role === 'admin') {
    query = `
      SELECT
        j.job_id,
        j.title,
        j.job_code,
        COALESCE(c.client_name, j.company, '') AS client_name,
        j.location,
        COALESCE(u.email, 'Unknown') AS recruiter_email,

        COUNT(a.application_id)                              AS applications,
        COUNT(*) FILTER (WHERE a.status = 'interview')       AS interviews,
        COUNT(*) FILTER (WHERE a.status = 'offered')         AS offers,
        COUNT(*) FILTER (WHERE a.status = 'accepted')        AS hires,
        COUNT(*) FILTER (WHERE a.status = 'rejected')        AS rejected

      FROM jobs j
      LEFT JOIN users    u ON u.userid = j.posted_by
      LEFT JOIN clients  c ON c.client_id = j.client_id
      LEFT JOIN applications a
        ON a.job_id = j.job_id
        ${hasDateRange ? `AND a.applied_date::date BETWEEN $1 AND $2` : ''}

      WHERE j.status = 'active'
      GROUP BY
        j.job_id,
        j.title,
        j.job_code,
        j.location,
        u.email,
        c.client_name,
        j.company
      ORDER BY applications DESC;
    `;

    if (hasDateRange) params = [from, to];
  } else if (role === 'lead') {
    query = `
      SELECT
        j.job_id,
        j.title,
        j.job_code,
        COALESCE(c.client_name, j.company, '') AS client_name,
        j.location,
        COALESCE(u.email, 'Unknown') AS recruiter_email,

        COUNT(a.application_id)                              AS applications,
        COUNT(*) FILTER (WHERE a.status = 'interview')       AS interviews,
        COUNT(*) FILTER (WHERE a.status = 'offered')         AS offers,
        COUNT(*) FILTER (WHERE a.status = 'accepted')        AS hires,
        COUNT(*) FILTER (WHERE a.status = 'rejected')        AS rejected

      FROM jobs j
      LEFT JOIN users    u ON u.userid = j.posted_by
      LEFT JOIN clients  c ON c.client_id = j.client_id
      LEFT JOIN applications a
        ON a.job_id = j.job_id
        ${hasDateRange ? `AND a.applied_date::date BETWEEN $2 AND $3` : ''}

      WHERE j.status = 'active'
      AND (j.posted_by = $1 OR u.created_by = $1)
      GROUP BY
        j.job_id,
        j.title,
        j.job_code,
        j.location,
        u.email,
        c.client_name,
        j.company
      ORDER BY applications DESC;
    `;

    params = hasDateRange ? [userId, from, to] : [userId];
  } else {
    query = `
      SELECT
        j.job_id,
        j.title,
        j.job_code,
        COALESCE(c.client_name, j.company, '') AS client_name,
        j.location,
        COALESCE(u.email, 'Unknown') AS recruiter_email,

        COUNT(a.application_id)                              AS applications,
        COUNT(*) FILTER (WHERE a.status = 'interview')       AS interviews,
        COUNT(*) FILTER (WHERE a.status = 'offered')         AS offers,
        COUNT(*) FILTER (WHERE a.status = 'accepted')        AS hires,
        COUNT(*) FILTER (WHERE a.status = 'rejected')        AS rejected

      FROM jobs j
      JOIN job_assignments ja
        ON ja.job_id = j.job_id
       AND ja.status = 'active'
       AND (
         ja.assigned_to_user_id = $1
         OR (ja.assigned_to_user_id IS NULL AND ja.assignment_type IN ($2, 'all'))
       )

      LEFT JOIN users   u ON u.userid = j.posted_by
      LEFT JOIN clients c ON c.client_id = j.client_id
      LEFT JOIN applications a
        ON a.job_id = j.job_id
        ${hasDateRange ? `AND a.applied_date::date BETWEEN $3 AND $4` : ''}

      WHERE j.status = 'active'
      GROUP BY
        j.job_id,
        j.title,
        j.job_code,
        j.location,
        u.email,
        c.client_name,
        j.company
      ORDER BY applications DESC;
    `;

    params = hasDateRange
      ? [userId, role, from, to]
      : [userId, role];
  }

  return { query, params, hasDateRange };
};

const mapJobPerformanceRows = (rows: any[]): JobPerformanceRow[] =>
  rows.map((r) => ({
    job_id: r.job_id,
    title: r.title,
    job_code: r.job_code || '',
    client_name: r.client_name || '',
    location: r.location || '',
    recruiter_email: r.recruiter_email,
    applications: Number(r.applications),
    interviews: Number(r.interviews),
    offers: Number(r.offers),
    hires: Number(r.hires),
    rejected: Number(r.rejected),
  }));

const buildStatusUpdateReportQuery = (
  role: Role,
  userId: number,
  from: string,
  to: string
) => {
  const hasDateRange =
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to);

  const dateClause = hasDateRange
    ? "AND COALESCE(a.updated_at, a.created_at) >= $1 AND COALESCE(a.updated_at, a.created_at) < ($2::date + INTERVAL '1 day')"
    : "";

  let visibilityClause = "";
  const params: any[] = hasDateRange ? [from, to] : [];

  if (role === 'vendor') {
    visibilityClause = `AND a.vendor_id = ${hasDateRange ? '$3' : '$1'}`;
    params.push(userId);
  } else if (role === 'lead') {
    visibilityClause = `
      AND (
        a.uploaded_by_user_id = ${hasDateRange ? '$3' : '$1'}
        OR a.vendor_id = ${hasDateRange ? '$3' : '$1'}
        OR EXISTS (
          SELECT 1 FROM users u_sub 
          WHERE u_sub.userid = COALESCE(a.uploaded_by_user_id, a.vendor_id)
          AND u_sub.created_by = ${hasDateRange ? '$3' : '$1'}
        )
      )
    `;
    params.push(userId);
  } else if (role === 'recruiter') {
    visibilityClause = `
      AND (
        EXISTS (
          SELECT 1
          FROM job_assignments ja
          WHERE ja.job_id = a.job_id
            AND ja.status = 'active'
            AND (
              ja.assigned_to_user_id = ${hasDateRange ? '$3' : '$1'}
              OR (ja.assigned_to_user_id IS NULL AND ja.assignment_type IN ('recruiter', 'all'))
            )
        )
      )
    `;
    params.push(userId);
  }

  const query = `
    SELECT
      a.application_id,
      COALESCE(j.title, '') AS job_name,
      COALESCE(j.job_code, '') AS job_code,
      COALESCE(c.full_name, '') AS candidate_name,
      a.status,
      COALESCE(a.updated_at, a.created_at) AS updated_at,
      COALESCE(u.name, u.email, 'Unknown') AS recruiter_name
    FROM applications a
    JOIN jobs j ON a.job_id = j.job_id
    JOIN candidates c ON a.candidate_id = c.candidate_id
    LEFT JOIN users u ON j.posted_by = u.userid
    WHERE 1=1
    ${dateClause}
    ${visibilityClause}
    ORDER BY updated_at DESC;
  `;

  return { query, params };
};

const mapStatusUpdateReportRows = (rows: any[]): StatusUpdateReportRow[] =>
  rows.map((r) => ({
    application_id: r.application_id,
    job_name: r.job_name,
    job_code: r.job_code,
    candidate_name: r.candidate_name,
    status: r.status,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : '',
    recruiter_name: r.recruiter_name,
  }));

export const getJobPerformance = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const user: any = (req as any).user;
    if (!user?.id || !user?.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id as number;
    const role = user.role.toLowerCase() as Role;

    if (role !== 'admin' && role !== 'recruiter' && role !== 'vendor' && role !== 'lead') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { query, params } = buildJobPerformanceQuery(role, userId, from, to);

    const result = await client.query(query, params);

    /* ===== TOTAL JOBS (UNCHANGED) ===== */
    const totalJobsRes =
      role === 'admin' || role === 'lead'
        ? await client.query(
          `SELECT COUNT(*) FROM jobs WHERE status = 'active'`
        )
        : await client.query(
          `SELECT COUNT(DISTINCT j.job_id)
             FROM jobs j
             JOIN job_assignments ja ON ja.job_id = j.job_id
             WHERE j.status = 'active'
               AND ja.status = 'active'
               AND (
                 ja.assigned_to_user_id = $1
                 OR (ja.assigned_to_user_id IS NULL AND ja.assignment_type IN ($2, 'all'))
               )`,
          [userId, role]
        );

    res.json({
      success: true,
      total_jobs: Number(totalJobsRes.rows[0].count || 0),
      data: mapJobPerformanceRows(result.rows)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load report' });
  } finally {
    client.release();
  }
};

export const getResumeUploadReport = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const user: any = (req as any).user;
    if (!user?.id || !user?.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id as number;
    const role = user.role.toLowerCase() as Role;

    if (role !== 'admin' && role !== 'recruiter' && role !== 'vendor' && role !== 'lead') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { query, params } = buildResumeUploadReportQuery(role, userId, from, to);
    const result = await client.query(query, params);

    res.json({
      success: true,
      data: mapResumeUploadReportRows(result.rows),
    });
  } catch (err) {
    const e: any = err;
    console.error('Resume upload report error:', e?.message || e);
    if (e?.code) console.error('Resume upload report error code:', e.code);
    if (e?.detail) console.error('Resume upload report error detail:', e.detail);
    res.status(500).json({ error: 'Failed to load report', message: e?.message || String(e) });
  } finally {
    client.release();
  }
};

export const exportResumeUploadReport = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const user: any = (req as any).user;
    if (!user?.id || !user?.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id as number;
    const role = user.role.toLowerCase() as Role;

    if (role !== 'admin' && role !== 'recruiter' && role !== 'vendor' && role !== 'lead') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { query, params } = buildResumeUploadReportQuery(role, userId, from, to);
    const result = await client.query(query, params);
    const rows = mapResumeUploadReportRows(result.rows);

    const header = [
      'Job Id',
      'Job Type',
      'Position',
      'Company Name',
      'Location',
      'Recruiter Name',
      'Candidate Id',
      'Candidate Name',
      'Uploading Date',
      'Status',
    ];

    const escapeCsv = (value: string | number): string => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csvLines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.job_id ?? '',
          r.job_type,
          r.position,
          r.company_name,
          r.location,
          r.recruiter_name,
          r.candidate_id ?? '',
          r.candidate_name,
          r.uploading_date,
          r.status,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    const csvContent = csvLines.join('\n');
    const filename = from && to ? `resume-upload-report_${from}_to_${to}.csv` : 'resume-upload-report.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    const e: any = err;
    console.error('Resume upload export error:', e?.message || e);
    if (e?.code) console.error('Resume upload export error code:', e.code);
    if (e?.detail) console.error('Resume upload export error detail:', e.detail);
    res.status(500).json({ error: 'Failed to export report', message: e?.message || String(e) });
  } finally {
    client.release();
  }
};

export const exportJobPerformance = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const user: any = (req as any).user;
    if (!user?.id || !user?.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id as number;
    const role = user.role.toLowerCase() as Role;

    if (role !== 'admin' && role !== 'recruiter' && role !== 'vendor' && role !== 'lead') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { query, params } = buildJobPerformanceQuery(role, userId, from, to);
    const result = await client.query(query, params);

    const rows = mapJobPerformanceRows(result.rows);

    const header = [
      'Job ID',
      'Job Title',
      'Job Code',
      'Client Name',
      'Location',
      'Recruiter Email',
      'Applications',
      'Interviews',
      'Offers',
      'Hires',
      'Rejected',
    ];

    const escapeCsv = (value: string | number): string => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csvLines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.job_id,
          r.title,
          r.job_code,
          r.client_name,
          r.location,
          r.recruiter_email,
          r.applications,
          r.interviews,
          r.offers,
          r.hires,
          r.rejected,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    const csvContent = csvLines.join('\n');

    const filename = from && to
      ? `job-report_${from}_to_${to}.csv`
      : 'job-report.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export report' });
  } finally {
    client.release();
  }
};

export const getStatusUpdateReport = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const user: any = (req as any).user;
    if (!user?.id || !user?.role) return res.status(401).json({ error: 'Unauthorized' });

    const role = user.role.toLowerCase() as Role;
    const userId = user.id as number;

    const { query, params } = buildStatusUpdateReportQuery(role, userId, from, to);
    const result = await client.query(query, params);

    res.json({
      success: true,
      data: mapStatusUpdateReportRows(result.rows),
    });
  } catch (err) {
    console.error('Status update report error:', err);
    res.status(500).json({ error: 'Failed to load report' });
  } finally {
    client.release();
  }
};

export const exportStatusUpdateReport = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const user: any = (req as any).user;
    if (!user?.id || !user?.role) return res.status(401).json({ error: 'Unauthorized' });

    const role = user.role.toLowerCase() as Role;
    const userId = user.id as number;

    const { query, params } = buildStatusUpdateReportQuery(role, userId, from, to);
    const result = await client.query(query, params);
    const rows = mapStatusUpdateReportRows(result.rows);

    const header = [
      'Application ID',
      'Job Name',
      'Job Code',
      'Candidate Name',
      'Status',
      'Update Date',
      'Recruiter Name',
    ];

    const escapeCsv = (value: string | number): string => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csvLines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.application_id,
          r.job_name,
          r.job_code,
          r.candidate_name,
          r.status,
          r.updated_at,
          r.recruiter_name,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    const csvContent = csvLines.join('\n');
    const filename = from && to ? `status-report_${from}_to_${to}.csv` : 'status-report.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('Status report export error:', err);
    res.status(500).json({ error: 'Failed to export report' });
  } finally {
    client.release();
  }
};
