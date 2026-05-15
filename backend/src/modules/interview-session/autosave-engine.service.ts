
import { pool } from "../../lib/database";
import { redisService } from "../../lib/redis";

export interface AutosavePayload {
    questionId: number;
    responseData: any;
    isDraft: boolean;
    clientTimestamp: string;
}

export class AutosaveEngineService {
    private static AUTOSAVE_PREFIX = "autosave:";

    /**
     * Persists autosave data to Redis (fast) and eventually to DB
     */
    public static async saveDraft(sessionId: number, payload: AutosavePayload): Promise<void> {
        const { questionId, responseData, isDraft, clientTimestamp } = payload;
        const cacheKey = `${this.AUTOSAVE_PREFIX}${sessionId}:${questionId}`;

        // 1. Store in Redis for quick recovery
        await redisService.set(cacheKey, JSON.stringify({
            responseData,
            isDraft,
            clientTimestamp,
            serverTimestamp: new Date().toISOString()
        }), 3600); // 1 hour TTL

        // 2. Persist to DB (idempotent update or insert)
        // We use interview_autosave_events for audit/history and interview_responses for current state if it's a final answer
        
        await pool.query(`
            INSERT INTO interview_autosave_events (session_id, question_id, response_data, is_draft, client_timestamp)
            VALUES ($1, $2, $3, $4, $5)
        `, [sessionId, questionId, JSON.stringify(responseData), isDraft, clientTimestamp]);

        // If it's a coding editor state or similar, we might also update the runtime state
        if (responseData.code || responseData.editorState) {
            await pool.query(`
                INSERT INTO interview_session_runtime (session_id, coding_state, last_sync_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (session_id) DO UPDATE SET coding_state = $2, last_sync_at = CURRENT_TIMESTAMP
            `, [sessionId, JSON.stringify(responseData)]);
        }
    }

    /**
     * Retrieves the latest autosaved state for a session
     */
    public static async getLastSavedState(sessionId: number, questionId: number): Promise<any> {
        const cacheKey = `${this.AUTOSAVE_PREFIX}${sessionId}:${questionId}`;
        const cached = await redisService.get(cacheKey);
        
        if (cached) return JSON.parse(cached);

        // Fallback to DB
        const result = await pool.query(`
            SELECT response_data, is_draft, client_timestamp, server_timestamp
            FROM interview_autosave_events
            WHERE session_id = $1 AND question_id = $2
            ORDER BY server_timestamp DESC
            LIMIT 1
        `, [sessionId, questionId]);

        return result.rows[0] || null;
    }

    /**
     * Bulk restore all autosaved drafts for a session (used during reconnect)
     */
    public static async restoreAllDrafts(sessionId: number): Promise<Record<number, any>> {
        const result = await pool.query(`
            SELECT DISTINCT ON (question_id) question_id, response_data, is_draft
            FROM interview_autosave_events
            WHERE session_id = $1
            ORDER BY question_id, server_timestamp DESC
        `, [sessionId]);

        const drafts: Record<number, any> = {};
        result.rows.forEach(row => {
            drafts[row.question_id] = {
                responseData: row.response_data,
                isDraft: row.is_draft
            };
        });

        return drafts;
    }
}
