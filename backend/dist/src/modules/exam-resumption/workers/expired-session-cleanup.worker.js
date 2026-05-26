import { pool } from "../../../lib/database";
import { SessionState } from "../../../common/types";
import { ExamSnapshotService } from "../services/exam-snapshot.service";
export class ExpiredSessionCleanupWorker {
    static interval = null;
    static start() {
        console.log("🚀 Starting ExpiredSessionCleanupWorker (every 60s)...");
        this.interval = setInterval(async () => {
            await this.cleanup();
        }, 60000);
    }
    static async cleanup() {
        try {
            // Find PAUSED sessions that have run out of time
            const result = await pool.query(`
                SELECT id FROM interview_sessions 
                WHERE state = $1
            `, [SessionState.PAUSED]);
            for (const row of result.rows) {
                const remaining = await ExamSnapshotService.computeRemainingTime(row.id);
                if (remaining <= 0) {
                    console.log(`[ExpiredSessionCleanupWorker] Auto-submitting expired session: ${row.id}`);
                    await pool.query(`
                        UPDATE interview_sessions 
                        SET state = $1, is_submitted = true, completed_at = CURRENT_TIMESTAMP 
                        WHERE id = $2
                    `, [SessionState.SUBMITTED, row.id]);
                    // Mark snapshot as inactive
                    await pool.query("UPDATE exam_snapshots SET is_active = false WHERE session_id = $1", [row.id]);
                }
            }
        }
        catch (error) {
            console.error(`[ExpiredSessionCleanupWorker] Error:`, error);
        }
    }
    static stop() {
        if (this.interval)
            clearInterval(this.interval);
    }
}
