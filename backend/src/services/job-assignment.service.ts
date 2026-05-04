// src/services/job-assignment.service.ts

/**
 * Job Assignment Service
 * Handles job visibility for vendor and recruiter dashboards.
 */

import { pool } from "../lib/database";

class JobAssignmentService {
  /**
   * =====================================================================
   * GET JOBS FOR USER (vendor / recruiter)
   * =====================================================================
   * Rules:
   *
   * SPECIFIC → user sees job if job_assignments.assigned_to_user_id = user
   *
   * vendor → sees:
   *   - specific vendor assignment
   *   - vendor-all (assigned_to_user_id NULL, assignment_type = 'vendor')
   *   - all jobs (assignment_type = 'all')
   *
   * recruiter → sees:
   *   - specific recruiter assignment
   *   - recruiter-all (assigned_to_user_id NULL, assignment_type = 'recruiter')
   *   - all jobs (assignment_type = 'all')
   * =====================================================================
   */
  async getJobsForUser(userId: number, userRole: string): Promise<any[]> {
    try {
      const role = userRole.toLowerCase();

      console.log(`🔍 jobAssignmentService → Fetching jobs for ${role} ${userId}`);

      const result = await pool.query(
        `
        SELECT DISTINCT
          j.job_id,
          j.title,
          j.company,
          j.client_id,
          c.client_name,
          j.location,
          j.employment_type,
          j.experience_level,
          j.status,
          j.job_code,
          j.posted_date,
          j.assignment_type,
          u.email AS posted_by_name,
          COUNT(a.application_id) FILTER (
            WHERE (
              $2 = 'vendor' AND a.vendor_id = $1
            )
            OR (
              $2 = 'recruiter'
              AND (
                a.uploaded_by_user_id = $1
                OR EXISTS (
                  SELECT 1
                  FROM resumes r
                  WHERE r.job_id = a.job_id
                    AND r.candidate_id = a.candidate_id
                    AND r.uploaded_by = $1
                )
              )
            )
            OR (
              $2 NOT IN ('vendor','recruiter')
            )
          ) AS application_count,
          COUNT(a.application_id) FILTER (
            WHERE (
              $2 = 'vendor' AND a.vendor_id = $1
            )
            OR (
              $2 = 'recruiter'
              AND (
                a.uploaded_by_user_id = $1
                OR EXISTS (
                  SELECT 1
                  FROM resumes r
                  WHERE r.job_id = a.job_id
                    AND r.candidate_id = a.candidate_id
                    AND r.uploaded_by = $1
                )
              )
            )
            OR (
              $2 NOT IN ('vendor','recruiter')
            )
          ) AS total_applicants
        FROM jobs j
        LEFT JOIN job_assignments ja 
               ON j.job_id = ja.job_id
              AND ja.status = 'active'
        LEFT JOIN users u ON u.userid = j.posted_by
        LEFT JOIN clients c ON c.client_id = j.client_id
        LEFT JOIN applications a 
               ON a.job_id = j.job_id
        WHERE 
          j.status = 'active'
          AND (
              -- 1️⃣ SPECIFIC user assignment
              (ja.assigned_to_user_id = $1)

              OR

              -- 2️⃣ VENDOR sees vendor-all or "all"
              ($2 = 'vendor' AND ja.assigned_to_user_id IS NULL AND ja.assignment_type = 'vendor')
              OR ($2 = 'vendor' AND ja.assigned_to_user_id IS NULL AND ja.assignment_type = 'all')

              OR

              -- 3️⃣ RECRUITER sees recruiter-all or "all"
              ($2 = 'recruiter' AND ja.assigned_to_user_id IS NULL AND ja.assignment_type = 'recruiter')
              OR ($2 = 'recruiter' AND ja.assigned_to_user_id IS NULL AND ja.assignment_type = 'all')
          )
        GROUP BY j.job_id, u.email, c.client_id, c.client_name
        ORDER BY j.posted_date DESC
        `,
        [userId, role]
      );

      return result.rows;
    } catch (err) {
      console.error("❌ Error getJobsForUser():", err);
      return [];
    }
  }

  /**
   * =====================================================================
   * GET ASSIGNEES (Admin dropdown)
   * =====================================================================
   */
  async getAvailableAssignees(role: "vendor" | "recruiter") {
    const result = await pool.query(
      `
      SELECT userid, email, role
      FROM users
      WHERE role = $1
        AND status = 'active'
      ORDER BY email
      `,
      [role]
    );
    return result.rows;
  }

  /**
   * =====================================================================
   * GET JOB ASSIGNMENTS (Admin panel)
   * =====================================================================
   */
  async getJobAssignments(jobId: number) {
    const result = await pool.query(
      `
      SELECT 
        ja.*, 
        u.email, 
        u.role
      FROM job_assignments ja
      LEFT JOIN users u 
             ON u.userid = ja.assigned_to_user_id
      WHERE ja.job_id = $1
        AND ja.status = 'active'
      ORDER BY ja.assigned_at DESC
      `,
      [jobId]
    );

    return result.rows;
  }

  /**
   * =====================================================================
   * REMOVE SPECIFIC ASSIGNMENT
   * =====================================================================
   */
  async removeAssignment(jobId: number, userId: number) {
    await pool.query(
      `
      UPDATE job_assignments
      SET status = 'cancelled'
      WHERE job_id = $1 
        AND assigned_to_user_id = $2
      `,
      [jobId, userId]
    );
  }

  /**
   * =====================================================================
   * GET ASSIGNED USER IDs (used for notifications)
   * =====================================================================
   */
  async getAssignedUserIds(jobId: number): Promise<number[]> {
    try {
      const result = await pool.query(
        `
        SELECT 
          j.assignment_type,
          COALESCE(
            array_agg(ja.assigned_to_user_id)
              FILTER (WHERE ja.assigned_to_user_id IS NOT NULL),
            '{}'
          ) AS assigned_users
        FROM jobs j
        LEFT JOIN job_assignments ja
               ON ja.job_id = j.job_id
              AND ja.status = 'active'
        WHERE j.job_id = $1
        GROUP BY j.job_id, j.assignment_type
        `,
        [jobId]
      );

      if (!result.rows.length) return [];

      const row = result.rows[0];

      /**
       * ALL = notify all vendors + recruiters
       */
      if (row.assignment_type === "all") {
        const allUsers = await pool.query(
          `SELECT userid FROM users WHERE (role='vendor' OR role='recruiter') AND status='active'`
        );
        return allUsers.rows.map((u: any) => u.userid);
      }

      return row.assigned_users || [];
    } catch (err) {
      console.error("❌ Error getAssignedUserIds():", err);
      return [];
    }
  }
}

export default new JobAssignmentService();
