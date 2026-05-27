
import { pool } from "../../lib/database";
import { TimerEngineService } from "./timer-engine.service";
import { SessionState } from "../../common/types";

export class SessionJobsService {
    private static isRunningExpiryCleaner = false;
    private static isRunningInactiveCleaner = false;
    private static isRunningSnapshotWorker = false;

    /**
     * Starts all background workers
     */
    public static start() {
        console.log("🚀 Initializing Session Background Workers...");
        
        // 1. Session Expiry Worker (every 1 minute)
        setInterval(() => this.cleanExpiredSessions(), 60 * 1000);

        // 2. Inactive Session Pauser (every 30 seconds)
        setInterval(() => this.pauseInactiveSessions(), 30 * 1000);

        // 3. Snapshot Consolidation (every 5 minutes)
        setInterval(() => this.consolidateSnapshots(), 5 * 60 * 1000);
    }

    /**
     * Marks sessions as EXPIRED if they've passed their server-calculated end time
     */
    private static async cleanExpiredSessions() {
        if (this.isRunningExpiryCleaner) return;
        this.isRunningExpiryCleaner = true;

        try {
            const now = new Date();
            const result = await pool.query(`
                UPDATE interview_sessions
                SET state = $1, completed_at = $2, status = 'completed'
                WHERE state = $3
                AND expires_at < $2
                RETURNING id
            `, [SessionState.EXPIRED, now, SessionState.ACTIVE]);

            if (result.rowCount && result.rowCount > 0) {
                console.log(`🧹 Cleaned up ${result.rowCount} expired sessions.`);
            }
        } catch (error) {
            console.error("❌ Expiry Cleaner Error:", error);
        } finally {
            this.isRunningExpiryCleaner = false;
        }
    }

    /**
     * Pauses sessions that haven't sent a heartbeat within the grace period
     */
    private static async pauseInactiveSessions() {
        if (this.isRunningInactiveCleaner) return;
        this.isRunningInactiveCleaner = true;

        try {
            const heartbeatGrace = 600; // 600 seconds (10 minutes)
            const result = await pool.query(`
                SELECT id, last_activity_at FROM interview_sessions
                WHERE state = $1
                AND last_activity_at < NOW() - INTERVAL '${heartbeatGrace} seconds'
            `, [SessionState.ACTIVE]);

            for (const row of result.rows) {
                await TimerEngineService.pauseTimer(
                    row.id,
                    "Heartbeat timeout (automatic pause)",
                    row.last_activity_at ? new Date(row.last_activity_at) : undefined
                );
            }
        } catch (error) {
            console.error("❌ Inactive Cleaner Error:", error);
        } finally {
            this.isRunningInactiveCleaner = false;
        }
    }

    /**
     * Placeholder for snapshot consolidation or audit log aggregation
     */
    private static async consolidateSnapshots() {
        if (this.isRunningSnapshotWorker) return;
        this.isRunningSnapshotWorker = true;

        try {
            // Logic to move old snapshots to cold storage or aggregate logs
            // For now, just clean up heartbeat logs older than 24h
            await pool.query(`DELETE FROM interview_heartbeat_logs WHERE created_at < NOW() - INTERVAL '24 hours'`);
        } catch (error) {
            console.error("❌ Snapshot Worker Error:", error);
        } finally {
            this.isRunningSnapshotWorker = false;
        }
    }
}
