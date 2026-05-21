import { pool } from "../../lib/database";
import { SessionState, EnterpriseError } from "../../common/types";
import { TimerEngineService } from "./timer-engine.service";
import { AutosaveEngineService } from "./autosave-engine.service";
import crypto from "crypto";
export class RecoveryEngineService {
    /**
     * Validates if a session can be resumed and returns the full state snapshot
     */
    static async validateAndRestore(token, fingerprint, ip, userAgent) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // 1. Fetch Session and Token Info
            const result = await client.query(`
                SELECT s.*, t.expires_at as link_expiry, t.device_id as original_device
                FROM interview_sessions s
                JOIN interview_tokens t ON s.token = t.token
                WHERE s.token = $1 FOR UPDATE
            `, [token]);
            if (result.rows.length === 0)
                throw new EnterpriseError("Invalid or non-existent token", "SESSION_NOT_FOUND", 404);
            const session = result.rows[0];
            // 2. Validate State
            const terminalStates = [SessionState.SUBMITTED, SessionState.EXPIRED, SessionState.TERMINATED, SessionState.BLOCKED];
            if (terminalStates.includes(session.state)) {
                throw new EnterpriseError(`Session is in ${session.state} state and cannot be resumed`, "INVALID_STATE", 403);
            }
            // 3. Security Check: Fingerprint & Device
            const currentFingerprintHash = crypto.createHash("sha256").update(fingerprint).digest("hex");
            if (session.fingerprint_hash && session.fingerprint_hash !== currentFingerprintHash) {
                // Log suspicious activity
                await client.query(`
                    INSERT INTO interview_reconnect_logs (session_id, event_type, ip_address, user_agent, fingerprint_hash, status, reason)
                    VALUES ($1, 'RECONNECT_FAILURE', $2, $3, $4, 'FAILED', 'Fingerprint mismatch')
                `, [session.id, ip, userAgent, currentFingerprintHash]);
                throw new EnterpriseError("Security violation: Resumption from an unauthorized device detected", "DEVICE_MISMATCH", 403);
            }
            // 4. Timer Validation
            if (session.state === SessionState.ACTIVE) {
                const now = new Date();
                if (session.expires_at && now > new Date(session.expires_at)) {
                    await client.query("UPDATE interview_sessions SET state = $1 WHERE id = $2", [SessionState.EXPIRED, session.id]);
                    throw new EnterpriseError("The examination time has expired", "TIME_EXPIRED", 403);
                }
            }
            // 5. Restore Timer (and adjust for pause duration if needed)
            const remainingSeconds = await TimerEngineService.resumeTimer(session.id);
            // 6. Gather State Components
            // A. Questions History (Deterministic Sequence)
            const questionsResult = await client.query(`
                SELECT id, question, options, question_type, difficulty_score
                FROM interview_questions
                WHERE session_id = $1
                ORDER BY id ASC
            `, [session.id]);
            // B. Autosaved Drafts
            const drafts = await AutosaveEngineService.restoreAllDrafts(session.id);
            // C. Adaptive Engine State
            const adaptiveSnapshot = await client.query(`
                SELECT * FROM adaptive_engine_snapshots
                WHERE session_id = $1
                ORDER BY created_at DESC LIMIT 1
            `, [session.id]);
            // D. Runtime state (current index, navigation)
            const runtimeResult = await client.query(`
                SELECT * FROM interview_session_runtime WHERE session_id = $1
            `, [session.id]);
            const runtime = runtimeResult.rows[0] || { current_question_index: questionsResult.rows.length - 1 };
            // 7. Log Success
            await client.query(`
                INSERT INTO interview_reconnect_logs (session_id, event_type, ip_address, user_agent, fingerprint_hash, status)
                VALUES ($1, 'RECONNECT_SUCCESS', $2, $3, $4, 'SUCCESS')
            `, [session.id, ip, userAgent, currentFingerprintHash]);
            await client.query(`
                INSERT INTO session_resume_audit (session_id, previous_state, new_state, resume_point_question_id, recovered_fields)
                VALUES ($1, $2, 'ACTIVE', $3, $4)
            `, [session.id, session.state, runtime.current_question_id, ['questions', 'drafts', 'timer', 'adaptive_state']]);
            await client.query("COMMIT");
            return {
                sessionId: session.id,
                state: SessionState.ACTIVE,
                remainingSeconds,
                candidateName: session.candidate_name,
                role: session.role,
                currentQuestionIndex: runtime.current_question_index,
                questions: questionsResult.rows,
                drafts,
                adaptiveState: adaptiveSnapshot.rows[0] || { theta: session.current_theta },
                runtime: {
                    navigation: runtime.navigation_state,
                    coding: runtime.coding_state
                }
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Create a point-in-time snapshot of the entire session
     */
    static async createSnapshot(sessionId, trigger) {
        // Collect all data and save to interview_session_snapshots
        const sessionRes = await pool.query("SELECT * FROM interview_sessions WHERE id = $1", [sessionId]);
        const questionsRes = await pool.query("SELECT * FROM interview_questions WHERE session_id = $1", [sessionId]);
        const responsesRes = await pool.query("SELECT * FROM interview_responses WHERE session_id = $1", [sessionId]);
        const runtimeRes = await pool.query("SELECT * FROM interview_session_runtime WHERE session_id = $1", [sessionId]);
        const snapshot = {
            session: sessionRes.rows[0],
            questions: questionsRes.rows,
            responses: responsesRes.rows,
            runtime: runtimeRes.rows[0]
        };
        await pool.query(`
            INSERT INTO interview_session_snapshots (session_id, snapshot_data, trigger_event)
            VALUES ($1, $2, $3)
        `, [sessionId, JSON.stringify(snapshot), trigger]);
    }
}
