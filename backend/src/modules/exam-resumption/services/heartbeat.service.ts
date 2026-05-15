
import { pool } from "../../../lib/database";
import { redisService as redis } from "../../../lib/redis";
import { HeartbeatPayload } from "../types/resumption.types";
import { ExamSnapshotService } from "./exam-snapshot.service";
import { ExamResumptionService } from "./exam-resumption.service";

export class HeartbeatService {
    /**
     * Records a heartbeat and updates the server-authoritative tracking.
     */
    public static async recordHeartbeat(sessionId: number, candidateId: number, payload: HeartbeatPayload): Promise<void> {
        const serverRemaining = await ExamSnapshotService.computeRemainingTime(sessionId);
        
        // 1. High-Write optimized insert (non-blocking in high-load scenarios via pool)
        // In a real high-load environment, we might use a background worker to batch these.
        void pool.query(`
            INSERT INTO exam_heartbeats (
                session_id, candidate_id, client_reported_remaining_seconds, 
                server_computed_remaining_seconds, page_visibility_state, network_quality
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            sessionId, candidateId, payload.clientReportedRemainingSeconds, 
            serverRemaining, payload.pageVisibility, payload.networkQuality
        ]).catch(err => console.error(`[HeartbeatService] DB Error:`, err));

        // 2. Update snapshot timestamp and Redis cache
        await pool.query(
            "UPDATE exam_snapshots SET last_heartbeat_at = CURRENT_TIMESTAMP WHERE session_id = $1",
            [sessionId]
        );
        
        await redis.set(`heartbeat:last:${sessionId}`, new Date().toISOString(), 120);

        // 3. Drift Detection
        const drift = Math.abs(payload.clientReportedRemainingSeconds - serverRemaining);
        if (drift > 30) {
            console.warn(`[ANOMALY] Time drift detected for session ${sessionId}: ${drift}s difference.`);
            // Log to audit or notify admin if needed
        }
    }

    /**
     * Background task to detect dead sessions.
     */
    public static async detectMissingHeartbeats(): Promise<void> {
        try {
            const result = await pool.query(`
                SELECT session_id FROM exam_snapshots 
                WHERE is_active = true 
                AND last_heartbeat_at < NOW() - INTERVAL '45 seconds'
                AND session_id IN (SELECT id FROM interview_sessions WHERE state = 'ACTIVE')
            `);

            for (const row of result.rows) {
                await ExamResumptionService.detectDisruption(row.session_id);
            }
        } catch (error) {
            console.error(`[HeartbeatService] detectMissingHeartbeats failed:`, error);
        }
    }
}
