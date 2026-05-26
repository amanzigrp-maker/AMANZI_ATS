import { pool } from "../../../lib/database";
import { redisService as redis } from "../../../lib/redis";
import { SessionState } from "../../../common/types";
export class StaleSnapshotReaper {
    static interval = null;
    static start() {
        console.log("🚀 Starting StaleSnapshotReaper (every 5m)...");
        this.interval = setInterval(async () => {
            await this.reap();
        }, 5 * 60 * 1000);
    }
    static async reap() {
        try {
            // Mark snapshots inactive if session is finalized
            const result = await pool.query(`
                UPDATE exam_snapshots 
                SET is_active = false 
                WHERE is_active = true 
                AND session_id IN (
                    SELECT id FROM interview_sessions 
                    WHERE state IN ($1, $2, $3)
                )
                RETURNING session_id
            `, [SessionState.SUBMITTED, SessionState.EXPIRED, SessionState.TERMINATED]);
            for (const row of result.rows) {
                await redis.del(`snapshot:${row.session_id}`);
                await redis.del(`heartbeat:last:${row.session_id}`);
                await redis.del(`answer:buffer:${row.session_id}`);
            }
        }
        catch (error) {
            console.error(`[StaleSnapshotReaper] Error:`, error);
        }
    }
    static stop() {
        if (this.interval)
            clearInterval(this.interval);
    }
}
