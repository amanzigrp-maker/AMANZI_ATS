
import { pool } from "../../../lib/database";
import { ExamSnapshotService } from "./exam-snapshot.service";
import { ResumePayload, ResumePolicy, DisruptionType } from "../types/resumption.types";
import { SessionState } from "../../../common/types";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../../../middleware/auth.middleware";

export class ExamResumptionService {
    private static readonly RESUME_ATTEMPT_LIMIT = 10;
    private static readonly POLICY: ResumePolicy = "STRICT";

    /**
     * Re-validates a candidate and grants session restoration if security checks pass.
     */
    public static async initiateResume(
        sessionId: number, 
        deviceFingerprint: string, 
        ip: string
    ): Promise<ResumePayload> {
        // 1. Validate Session State
        const sessionRes = await pool.query(
            "SELECT state, token, candidate_email, candidate_id FROM interview_sessions WHERE id = $1",
            [sessionId]
        );
        if (sessionRes.rowCount === 0) throw new Error("Session not found");
        const session = sessionRes.rows[0];

        if (session.state !== SessionState.ACTIVE && session.state !== SessionState.PAUSED) {
            throw new Error(`Session is in non-resumable state: ${session.state}`);
        }

        // 2. Load and Validate Snapshot
        const snapshot = await ExamSnapshotService.loadSnapshot(sessionId);
        if (!snapshot) throw new Error("No exam snapshot found to resume from");

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
        const refreshedToken = jwt.sign(
            { id: session.candidate_id, email: session.candidate_email, role: 'candidate', interview_token: session.token },
            getJwtSecret(),
            { expiresIn: '2h' }
        );

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
    public static async detectDisruption(sessionId: number): Promise<void> {
        const result = await pool.query(
            "SELECT state, candidate_id FROM interview_sessions WHERE id = $1",
            [sessionId]
        );
        if (result.rowCount === 0) return;
        const session = result.rows[0];

        if (session.state === SessionState.ACTIVE) {
            const now = new Date();
            // We need expires_at to calculate current remaining time accurately
            const timeRes = await pool.query("SELECT expires_at, remaining_seconds FROM interview_sessions WHERE id = $1", [sessionId]);
            const sessionData = timeRes.rows[0];
            
            let remainingSeconds = sessionData.remaining_seconds;
            if (sessionData.expires_at) {
                const expiresAt = new Date(sessionData.expires_at);
                remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
            }

            await pool.query(
                "UPDATE interview_sessions SET state = $1, paused_at = $2, last_activity_at = $3, remaining_seconds = $4 WHERE id = $5",
                [SessionState.PAUSED, now, now, remainingSeconds, sessionId]
            );
            
            // Record the pause in audit
            await pool.query(
                "INSERT INTO exam_state_audit (session_id, old_state, new_state, reason) VALUES ($1, $2, $3, $4)",
                [sessionId, SessionState.ACTIVE, SessionState.PAUSED, "Heartbeat timeout (Automatic Disruption Detection)"]
            );
        }
    }

    private static async recordDisruption(
        sessionId: number, 
        candidateId: number, 
        type: DisruptionType, 
        ip: string, 
        fingerprint: string, 
        isSuspicious: boolean,
        isResume: boolean = false
    ) {
        if (isResume) {
            await pool.query(`
                UPDATE exam_disruption_events 
                SET resumed_at = CURRENT_TIMESTAMP, ip_at_resume = $1, resume_device_fingerprint = $2
                WHERE session_id = $3 AND resumed_at IS NULL
            `, [ip, fingerprint, sessionId]);
        } else {
            await pool.query(`
                INSERT INTO exam_disruption_events (session_id, candidate_id, disruption_type, ip_at_disruption, was_suspicious)
                VALUES ($1, $2, $3, $4, $5)
            `, [sessionId, candidateId, type, ip, isSuspicious]);
        }
    }

    private static async finalizeExpiredSession(sessionId: number) {
        await pool.query(
            "UPDATE interview_sessions SET state = $1, is_submitted = true, completed_at = CURRENT_TIMESTAMP WHERE id = $2",
            [SessionState.EXPIRED, sessionId]
        );
    }
}
