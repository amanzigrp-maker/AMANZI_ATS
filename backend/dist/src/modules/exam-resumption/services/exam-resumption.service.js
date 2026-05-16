import { pool } from "../../../lib/database";
import { ExamSnapshotService } from "./exam-snapshot.service";
import { SessionState } from "../../../common/types";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../../../middleware/auth.middleware";
export class ExamResumptionService {
    static RESUME_ATTEMPT_LIMIT = 10;
    static POLICY = "STRICT";
    /**
     * Re-validates a candidate and grants session restoration if security checks pass.
     */
    static async initiateResume(sessionId, deviceFingerprint, ip) {
        // 1. Validate Session State
        const sessionRes = await pool.query("SELECT state, token, candidate_email, candidate_id FROM interview_sessions WHERE id = $1", [sessionId]);
        if (sessionRes.rowCount === 0)
            throw new Error("Session not found");
        const session = sessionRes.rows[0];
        if (session.state !== SessionState.ACTIVE && session.state !== SessionState.PAUSED) {
            throw new Error(`Session is in non-resumable state: ${session.state}`);
        }
        // 2. Load and Validate Snapshot
        const snapshot = await ExamSnapshotService.loadSnapshot(sessionId);
        if (!snapshot)
            throw new Error("No exam snapshot found to resume from");
        // 3. Authoritative Timing Check
        const remaining = await ExamSnapshotService.computeRemainingTime(sessionId);
        if (remaining <= 0) {
            await this.finalizeExpiredSession(sessionId);
            throw new Error("EXPIRED");
        }
        // 4. Device Fingerprint Validation
        const fingerprintMatch = snapshot.device_fingerprint_at_snapshot === deviceFingerprint;
        if (!fingerprintMatch) {
            await this.recordDisruption(sessionId, session.candidate_id, "UNKNOWN", ip, deviceFingerprint, true);
            if (this.POLICY === "STRICT") {
                await pool.query("UPDATE interview_sessions SET state = $1 WHERE id = $2", [SessionState.BLOCKED, sessionId]);
                throw new Error("SECURITY_LOCKOUT");
            }
        }
        // 5. Update State and Resume Count
        await pool.query(`
            UPDATE interview_sessions SET state = $1, last_activity_at = CURRENT_TIMESTAMP WHERE id = $2;
            UPDATE exam_snapshots SET resume_count = resume_count + 1 WHERE session_id = $2;
        `, [SessionState.ACTIVE, sessionId]);
        await this.recordDisruption(sessionId, session.candidate_id, "NETWORK_DROP", ip, deviceFingerprint, false, true);
        // 6. Generate Refreshed JWT
        const refreshedToken = jwt.sign({ id: session.candidate_id, email: session.candidate_email, role: 'candidate', interview_token: session.token }, getJwtSecret(), { expiresIn: '2h' });
        return {
            resumeGranted: true,
            remainingSeconds: remaining,
            currentQuestionIndex: snapshot.current_question_index,
            questionsServed: snapshot.questions_served,
            answersSubmitted: snapshot.answers_submitted,
            currentTheta: Number(snapshot.current_theta),
            skillRotationState: snapshot.skill_rotation_state,
            sessionToken: refreshedToken,
            warningMessage: fingerprintMatch ? undefined : "Device mismatch logged. Security team notified."
        };
    }
    /**
     * Detects disruption and pauses the session.
     */
    static async detectDisruption(sessionId) {
        const result = await pool.query("SELECT state, candidate_id FROM interview_sessions WHERE id = $1", [sessionId]);
        if (result.rowCount === 0)
            return;
        const session = result.rows[0];
        if (session.state === SessionState.ACTIVE) {
            await pool.query("UPDATE interview_sessions SET state = $1, last_activity_at = CURRENT_TIMESTAMP WHERE id = $2", [SessionState.PAUSED, sessionId]);
            // Record the pause in audit
            await pool.query("INSERT INTO exam_state_audit (session_id, old_state, new_state, reason) VALUES ($1, $2, $3, $4)", [sessionId, SessionState.ACTIVE, SessionState.PAUSED, "Heartbeat timeout"]);
        }
    }
    static async recordDisruption(sessionId, candidateId, type, ip, fingerprint, isSuspicious, isResume = false) {
        if (isResume) {
            await pool.query(`
                UPDATE exam_disruption_events 
                SET resumed_at = CURRENT_TIMESTAMP, ip_at_resume = $1, resume_device_fingerprint = $2
                WHERE session_id = $3 AND resumed_at IS NULL
            `, [ip, fingerprint, sessionId]);
        }
        else {
            await pool.query(`
                INSERT INTO exam_disruption_events (session_id, candidate_id, disruption_type, ip_at_disruption, was_suspicious)
                VALUES ($1, $2, $3, $4, $5)
            `, [sessionId, candidateId, type, ip, isSuspicious]);
        }
    }
    static async finalizeExpiredSession(sessionId) {
        await pool.query("UPDATE interview_sessions SET state = $1, is_submitted = true, completed_at = CURRENT_TIMESTAMP WHERE id = $2", [SessionState.EXPIRED, sessionId]);
    }
}
