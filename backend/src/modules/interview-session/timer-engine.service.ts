
import { pool } from "../../lib/database";
import { redisService } from "../../lib/redis";
import { SessionState, EnterpriseError } from "../../common/types";

export interface TimerState {
    sessionId: number;
    startedAt: Date;
    expiresAt: Date;
    remainingSeconds: number;
    status: 'ACTIVE' | 'PAUSED' | 'DISCONNECTED';
    lastHeartbeat: Date;
}

export class TimerEngineService {
    private static TIMER_PREFIX = "timer:";
    private static HEARTBEAT_INTERVAL_SEC = 30;
    private static GRACE_PERIOD_SEC = 300; // 5 minutes

    /**
     * Initializes a server-authoritative timer for a session
     */
    public static async initializeTimer(sessionId: number, durationMins: number): Promise<TimerState> {
        const startedAt = new Date();
        const expiresAt = new Date(startedAt.getTime() + durationMins * 60 * 1000);
        const remainingSeconds = durationMins * 60;

        const timerState: TimerState = {
            sessionId,
            startedAt,
            expiresAt,
            remainingSeconds,
            status: 'ACTIVE',
            lastHeartbeat: startedAt
        };

        // Persist to DB
        await pool.query(`
            UPDATE interview_sessions 
            SET started_at = $1, expires_at = $2, remaining_seconds = $3, state = $4, last_activity_at = $5
            WHERE id = $6
        `, [startedAt, expiresAt, remainingSeconds, SessionState.ACTIVE, startedAt, sessionId]);

        // Sync to Redis
        await this.syncToRedis(timerState);

        return timerState;
    }

    /**
     * Records a heartbeat and validates timing
     */
    public static async processHeartbeat(sessionId: number, ip: string): Promise<{ remainingSeconds: number; status: string }> {
        // 1. Get current state from Redis or DB
        let state = await this.getFromRedis(sessionId);
        if (!state) {
            state = await this.restoreFromDB(sessionId);
        }

        if (!state) throw new EnterpriseError("Session timer not found", "TIMER_NOT_FOUND", 404);

        const now = new Date();

        // 2. Calculate actual remaining time
        // If ACTIVE, remaining = expiresAt - now + totalPaused (or similar)
        // More robust: remaining = session.remaining_seconds (updated on last heartbeat/pause) - (now - lastActivity)
        
        const lastActivity = new Date(state.lastHeartbeat);
        const elapsedSinceLastHeartbeat = Math.floor((now.getTime() - lastActivity.getTime()) / 1000);
        
        let newRemaining = state.remainingSeconds - elapsedSinceLastHeartbeat;
        if (newRemaining < 0) newRemaining = 0;

        // 3. Update state
        state.remainingSeconds = newRemaining;
        state.lastHeartbeat = now;
        state.status = 'ACTIVE';

        // 4. Update DB & Redis
        await pool.query(`
            UPDATE interview_sessions 
            SET remaining_seconds = $1, last_activity_at = $2, state = $3
            WHERE id = $4
        `, [newRemaining, now, SessionState.ACTIVE, sessionId]);

        // Log heartbeat
        await pool.query(`
            INSERT INTO interview_heartbeat_logs (session_id, latency_ms, ip_address)
            VALUES ($1, $2, $3)
        `, [sessionId, 0, ip]); // Latency could be passed from frontend

        await this.syncToRedis(state);

        return { remainingSeconds: newRemaining, status: state.status };
    }

    /**
     * Pauses the timer (e.g., on disconnect or explicit pause)
     */
    public static async pauseTimer(sessionId: number, reason: string): Promise<void> {
        const now = new Date();
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query("SELECT remaining_seconds, state FROM interview_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
            if (result.rows.length === 0) return;

            if (result.rows[0].state === SessionState.PAUSED) return;

            await client.query(`
                UPDATE interview_sessions 
                SET state = $1, paused_at = $2, last_activity_at = $3
                WHERE id = $4
            `, [SessionState.PAUSED, now, now, sessionId]);

            await client.query(`
                INSERT INTO session_state_audit (session_id, from_state, to_state, reason, triggered_by)
                VALUES ($1, $2, $3, $4, 'system')
            `, [sessionId, result.rows[0].state, SessionState.PAUSED, reason]);

            await client.query("COMMIT");
            await redisService.del(`${this.TIMER_PREFIX}${sessionId}`);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Resumes the timer
     */
    public static async resumeTimer(sessionId: number): Promise<number> {
        const now = new Date();
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(`
                SELECT state, paused_at, total_paused_duration_ms, remaining_seconds, expires_at 
                FROM interview_sessions WHERE id = $1 FOR UPDATE
            `, [sessionId]);

            if (result.rows.length === 0) throw new Error("Session not found");
            const session = result.rows[0];

            if (session.state !== SessionState.PAUSED) return session.remaining_seconds;

            const pausedAt = new Date(session.paused_at);
            const pauseDuration = now.getTime() - pausedAt.getTime();
            const totalPaused = BigInt(session.total_paused_duration_ms) + BigInt(pauseDuration);

            // Shift expires_at by the pause duration
            const newExpiresAt = new Date(new Date(session.expires_at).getTime() + pauseDuration);

            await client.query(`
                UPDATE interview_sessions 
                SET state = $1, resumed_at = $2, total_paused_duration_ms = $3, expires_at = $4, last_activity_at = $5
                WHERE id = $6
            `, [SessionState.ACTIVE, now, totalPaused, newExpiresAt, now, sessionId]);

            await client.query("COMMIT");

            // Re-sync to Redis
            await this.restoreFromDB(sessionId);

            return session.remaining_seconds;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    private static async syncToRedis(state: TimerState): Promise<void> {
        await redisService.set(
            `${this.TIMER_PREFIX}${state.sessionId}`,
            JSON.stringify(state),
            this.HEARTBEAT_INTERVAL_SEC * 2 // TTL slightly more than heartbeat interval
        );
    }

    private static async getFromRedis(sessionId: number): Promise<TimerState | null> {
        const data = await redisService.get(`${this.TIMER_PREFIX}${sessionId}`);
        return data ? JSON.parse(data) : null;
    }

    private static async restoreFromDB(sessionId: number): Promise<TimerState | null> {
        const result = await pool.query(`
            SELECT id, started_at, expires_at, remaining_seconds, state, last_activity_at 
            FROM interview_sessions WHERE id = $1
        `, [sessionId]);

        if (result.rows.length === 0) return null;
        const row = result.rows[0];

        const state: TimerState = {
            sessionId: row.id,
            startedAt: new Date(row.started_at),
            expiresAt: new Date(row.expires_at),
            remainingSeconds: row.remaining_seconds,
            status: row.state === SessionState.ACTIVE ? 'ACTIVE' : (row.state === SessionState.PAUSED ? 'PAUSED' : 'DISCONNECTED'),
            lastHeartbeat: new Date(row.last_activity_at)
        };

        await this.syncToRedis(state);
        return state;
    }
}
