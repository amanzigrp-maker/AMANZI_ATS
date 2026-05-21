
import { pool } from "../../lib/database";
import { SessionState, EnterpriseError } from "../../common/types";
import crypto from "crypto";

export class SessionManagementService {

    /**
     * Transitions a session to a new state with audit logging
     */
    public static async transitionState(sessionId: number, toState: SessionState, reason: string, trigger: string, ip?: string): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Get current state
            const currentResult = await client.query(
                "SELECT state FROM interview_sessions WHERE id = $1 FOR UPDATE",
                [sessionId]
            );

            if (currentResult.rows.length === 0) throw new EnterpriseError("Session not found", "SESSION_NOT_FOUND", 404);
            const fromState = currentResult.rows[0].state;

            // Update session
            await client.query(
                "UPDATE interview_sessions SET state = $1, last_activity_at = CURRENT_TIMESTAMP WHERE id = $2",
                [toState, sessionId]
            );

            // Log transition
            await client.query(`
                INSERT INTO session_state_audit (session_id, from_state, to_state, reason, triggered_by, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [sessionId, fromState, toState, reason, trigger, ip]);

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Validates session for candidate access (Section 3)
     */
    public static async validateSessionAccess(token: string, fingerprint: string, ip: string): Promise<any> {
        const result = await pool.query(`
            SELECT s.*, t.expires_at as link_expiry, t.device_id as original_device
            FROM interview_sessions s
            JOIN interview_tokens t ON s.token = t.token
            WHERE s.token = $1
        `, [token]);

        if (result.rows.length === 0) throw new EnterpriseError("Invalid token", "INVALID_TOKEN", 401);
        const session = result.rows[0];

        // 1. Check State
        const invalidStates = [SessionState.SUBMITTED, SessionState.EXPIRED, SessionState.BLOCKED, SessionState.TERMINATED];
        if (invalidStates.includes(session.state)) {
            throw new EnterpriseError(`Session is in ${session.state} state`, "INVALID_STATE", 403);
        }

        // 2. Check Link Expiry (if not started)
        if (session.state === SessionState.CREATED && new Date() > new Date(session.link_expiry)) {
            await this.transitionState(session.id, SessionState.EXPIRED, "Link invitation expired", "system");
            throw new EnterpriseError("Link invitation has expired", "INVITATION_EXPIRED", 403);
        }

        // 3. Device Locking & Fingerprinting
        const currentFingerprint = crypto.createHash("sha256").update(fingerprint).digest("hex");
        if (session.fingerprint_hash && session.fingerprint_hash !== currentFingerprint) {
            await this.transitionState(session.id, SessionState.BLOCKED, "Fingerprint mismatch detected", "system", ip);
            throw new EnterpriseError("Access restricted to original device", "DEVICE_MISMATCH", 403);
        }

        // 4. Inactivity Timeout (e.g., 10 minutes)
        const inactivityLimit = 10 * 60 * 1000;
        if (session.state === SessionState.ACTIVE && (Date.now() - new Date(session.last_activity_at).getTime()) > inactivityLimit) {
            // Auto-pause or terminate? Let's go with pause for now.
            await this.transitionState(session.id, SessionState.PAUSED, "Inactivity timeout", "system");
        }

        return session;
    }

    /**
     * Background task to clean up expired sessions
     */
    public static async cleanupExpiredSessions(): Promise<number> {
        const result = await pool.query(`
            UPDATE interview_sessions
            SET state = 'EXPIRED'
            WHERE state IN ('CREATED', 'ACTIVE', 'PAUSED')
            AND (
                (state = 'CREATED' AND id IN (SELECT id FROM interview_tokens WHERE expires_at < CURRENT_TIMESTAMP))
                OR (last_activity_at < CURRENT_TIMESTAMP - INTERVAL '1 hour')
            )
            RETURNING id
        `);
        return result.rowCount || 0;
    }
}
