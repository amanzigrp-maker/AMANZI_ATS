
import { pool } from "../../../lib/database";

export class SnapshotGarbageCollector {
    private static interval: NodeJS.Timeout | null = null;

    public static start() {
        console.log("🚀 Starting SnapshotGarbageCollector (every 24h)...");
        // Run once a day
        this.interval = setInterval(async () => {
            await this.collect();
        }, 24 * 60 * 60 * 1000);
    }

    private static async collect() {
        try {
            console.log("[SnapshotGarbageCollector] Running cleanup...");
            // Archive logic could be added here
            const result = await pool.query(`
                DELETE FROM exam_snapshots 
                WHERE snapshot_taken_at < NOW() - INTERVAL '30 days'
                AND session_id IN (SELECT id FROM interview_sessions WHERE state IN ('SUBMITTED', 'EXPIRED', 'TERMINATED'))
            `);
            console.log(`[SnapshotGarbageCollector] Deleted ${result.rowCount} stale snapshots.`);
        } catch (error) {
            console.error(`[SnapshotGarbageCollector] Error:`, error);
        }
    }

    public static stop() {
        if (this.interval) clearInterval(this.interval);
    }
}
