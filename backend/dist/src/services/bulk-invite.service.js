import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../lib/database";
import { sendInterviewLink } from "./email.service";
export class BulkInviteService {
    /**
     * Simple temporary password generator
     */
    static generateTemporaryPassword() {
        return Math.random().toString(36).slice(-8) + "!";
    }
    /**
     * Validate email format
     */
    static isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    /**
     * Create a new bulk invitation job with its candidates
     */
    static async createBulkInviteJob(userId, name, assessmentId, jobId, candidates) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // 1. Create job entry
            const jobRes = await client.query(`
        INSERT INTO bulk_invite_jobs (name, assessment_id, job_id, created_by, status, total_count)
        VALUES ($1, $2, $3, $4, 'pending', $5)
        RETURNING *
        `, [name, assessmentId, jobId || null, userId, candidates.length]);
            const job = jobRes.rows[0];
            // 2. Insert candidates
            for (const c of candidates) {
                await client.query(`
          INSERT INTO bulk_invite_candidates (
            bulk_invite_job_id, name, email, phone, job_role, custom_tags, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'pending')
          `, [
                    job.id,
                    c.name.trim(),
                    c.email.trim().toLowerCase(),
                    c.phone || null,
                    c.job_role || null,
                    c.custom_tags || []
                ]);
            }
            await client.query("COMMIT");
            return job;
        }
        catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Background process queue processor
     * Processes a batch of pending candidates across active bulk invite jobs
     */
    static async processPendingInvites(batchSize = 5) {
        const client = await pool.connect();
        try {
            // 1. Lock a batch of pending candidates
            await client.query("BEGIN");
            const candidatesRes = await client.query(`
        SELECT c.*, j.assessment_id, j.created_by, j.job_id
        FROM bulk_invite_candidates c
        JOIN bulk_invite_jobs j ON c.bulk_invite_job_id = j.id
        WHERE c.status = 'pending' AND j.status != 'failed'
        ORDER BY c.id ASC
        LIMIT $1
        FOR UPDATE OF c SKIP LOCKED
        `, [batchSize]);
            if (candidatesRes.rows.length === 0) {
                await client.query("COMMIT");
                return 0;
            }
            console.log(`[BULK INVITE ENGINE] Found ${candidatesRes.rows.length} pending invites to process.`);
            for (const row of candidatesRes.rows) {
                const candidateIdInTable = row.id;
                const jobId = row.bulk_invite_job_id;
                const email = row.email;
                const name = row.name;
                const phone = row.phone;
                const jobRole = row.job_role;
                const assessmentId = row.assessment_id;
                const createdBy = row.created_by;
                // Perform validation
                if (!this.isValidEmail(email)) {
                    await this.markInviteFailed(client, candidateIdInTable, jobId, email, name, "Invalid email format");
                    continue;
                }
                try {
                    // Get assessment duration and question count
                    const assessRes = await client.query("SELECT duration_minutes, title FROM assessments WHERE assessment_id = $1", [assessmentId]);
                    if (assessRes.rows.length === 0) {
                        await this.markInviteFailed(client, candidateIdInTable, jobId, email, name, `Assessment ID ${assessmentId} not found`);
                        continue;
                    }
                    const durationMins = assessRes.rows[0].duration_minutes || 30;
                    const assessmentTitle = assessRes.rows[0].title;
                    // Find or create candidate
                    let candidateId;
                    const candRes = await client.query("SELECT candidate_id FROM candidates WHERE email = $1 LIMIT 1", [email]);
                    if (candRes.rows.length > 0) {
                        candidateId = candRes.rows[0].candidate_id;
                    }
                    else {
                        const newCand = await client.query("INSERT INTO candidates (full_name, email, phone, created_at) VALUES ($1, $2, $3, NOW()) RETURNING candidate_id", [name, email, phone || null]);
                        candidateId = newCand.rows[0].candidate_id;
                    }
                    // Generate credentials & token
                    const token = crypto.randomBytes(32).toString("hex");
                    const plainPassword = this.generateTemporaryPassword();
                    const hashedPassword = await bcrypt.hash(plainPassword, 10);
                    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours link validity for bulk
                    // Save link token
                    await client.query(`
            INSERT INTO interview_tokens (
              token, candidate_email, candidate_name, job_role, duration_mins, expires_at,
              is_used, password, total_questions, question_source, assessment_id, candidate_id, created_by, status, bulk_invite_job_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, false, $7, 10, 'bank', $8, $9, $10, 'sent', $11)
            `, [
                        token,
                        email,
                        name,
                        jobRole || assessmentTitle,
                        durationMins,
                        expiresAt,
                        hashedPassword,
                        assessmentId,
                        candidateId,
                        createdBy,
                        jobId
                    ]);
                    // Get frontend url
                    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === "production"
                        ? 'http://35.154.121.208'
                        : 'http://localhost:8080');
                    const loginUrl = `${frontendUrl}/interview?token=${encodeURIComponent(token)}&candidateId=${candidateId}`;
                    // Send Email
                    await sendInterviewLink(email, name, loginUrl, plainPassword, durationMins, 10);
                    // Update candidate invite success
                    await client.query(`UPDATE bulk_invite_candidates SET status = 'sent', error_message = NULL, updated_at = NOW() WHERE id = $1`, [candidateIdInTable]);
                    // Update success count on job
                    await client.query(`UPDATE bulk_invite_jobs SET success_count = success_count + 1, updated_at = NOW() WHERE id = $1`, [jobId]);
                    // Log to audit logs
                    await client.query(`
            INSERT INTO invite_logs (candidate_email, candidate_name, assessment_id, token, status)
            VALUES ($1, $2, $3, $4, 'sent')
            `, [email, name, assessmentId, token]);
                }
                catch (inviteErr) {
                    console.error(`[BULK INVITE ENGINE] Failed dispatch to ${email}:`, inviteErr);
                    await this.markInviteFailed(client, candidateIdInTable, jobId, email, name, inviteErr.message || "Email dispatch failed");
                }
            }
            // Check if jobs are completed
            const activeJobIds = Array.from(new Set(candidatesRes.rows.map((row) => row.bulk_invite_job_id)));
            for (const jid of activeJobIds) {
                const checkRes = await client.query(`
          SELECT 
            total_count,
            (SELECT COUNT(*)::int FROM bulk_invite_candidates WHERE bulk_invite_job_id = $1 AND status = 'pending') AS pending_count
          FROM bulk_invite_jobs
          WHERE id = $1
          `, [jid]);
                if (checkRes.rows.length > 0 && checkRes.rows[0].pending_count === 0) {
                    await client.query(`UPDATE bulk_invite_jobs SET status = 'completed', updated_at = NOW() WHERE id = $1`, [jid]);
                }
            }
            await client.query("COMMIT");
            return candidatesRes.rows.length;
        }
        catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            console.error("[BULK INVITE ENGINE] Batch transaction failed:", err);
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Helper to mark a candidate invite as failed
     */
    static async markInviteFailed(client, candidateTableId, jobId, email, name, errorMsg) {
        await client.query(`UPDATE bulk_invite_candidates SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, candidateTableId]);
        await client.query(`UPDATE bulk_invite_jobs SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = $1`, [jobId]);
        await client.query(`
      INSERT INTO invite_logs (candidate_email, candidate_name, status, error_message)
      VALUES ($1, $2, 'failed', $3)
      `, [email, name, errorMsg]);
    }
    /**
     * Retrieve list of bulk invite jobs with pagination
     */
    static async getBulkInviteJobs(userId, userRole, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        // RBAC: Recruiters/Leads see their own jobs
        if (userRole.toLowerCase() !== "admin" && userId) {
            conditions.push(`created_by = $${paramIndex}`);
            params.push(userId);
            paramIndex++;
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const query = `
      SELECT j.*, a.title AS assessment_title
      FROM bulk_invite_jobs j
      LEFT JOIN assessments a ON j.assessment_id = a.assessment_id
      ${whereClause}
      ORDER BY j.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        const countQuery = `
      SELECT COUNT(*)::int FROM bulk_invite_jobs j
      ${whereClause}
    `;
        const queryParams = [...params, limit, offset];
        const result = await pool.query(query, queryParams);
        const countParams = [...params];
        const countResult = await pool.query(countQuery, countParams);
        const total = countResult.rows[0]?.count || 0;
        return {
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
    /**
     * Retrieve details of a bulk invite job along with its candidates
     */
    static async getBulkInviteJobDetail(jobId) {
        const jobRes = await pool.query(`
      SELECT j.*, a.title AS assessment_title
      FROM bulk_invite_jobs j
      LEFT JOIN assessments a ON j.assessment_id = a.assessment_id
      WHERE j.id = $1
      `, [jobId]);
        if (jobRes.rows.length === 0)
            return null;
        const candidatesRes = await pool.query(`
      SELECT * FROM bulk_invite_candidates
      WHERE bulk_invite_job_id = $1
      ORDER BY id ASC
      `, [jobId]);
        return {
            ...jobRes.rows[0],
            candidates: candidatesRes.rows
        };
    }
    /**
     * Retry failed candidate invites in a bulk invite job
     */
    static async retryFailedInvites(jobId) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // 1. Get count of failed candidates in this job
            const checkRes = await client.query("SELECT COUNT(*)::int FROM bulk_invite_candidates WHERE bulk_invite_job_id = $1 AND status = 'failed'", [jobId]);
            const failedCount = checkRes.rows[0]?.count || 0;
            if (failedCount === 0) {
                await client.query("COMMIT");
                return 0;
            }
            // 2. Reset candidates back to pending
            await client.query(`
        UPDATE bulk_invite_candidates
        SET status = 'pending', error_message = NULL, retry_count = retry_count + 1, updated_at = NOW()
        WHERE bulk_invite_job_id = $1 AND status = 'failed'
        `, [jobId]);
            // 3. Reset job state
            await client.query(`
        UPDATE bulk_invite_jobs
        SET status = 'pending', failed_count = failed_count - $2, updated_at = NOW()
        WHERE id = $1
        `, [jobId, failedCount]);
            await client.query("COMMIT");
            return failedCount;
        }
        catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            throw err;
        }
        finally {
            client.release();
        }
    }
}
export default BulkInviteService;
