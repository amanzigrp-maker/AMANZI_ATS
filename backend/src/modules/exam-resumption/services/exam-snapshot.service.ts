import crypto from "crypto";
import { pool } from "../../../lib/database";
import { redisService as redis } from "../../../lib/redis";
import { ExamSnapshot, SnapshotPayload } from "../types/resumption.types";

export class ExamSnapshotService {
    private static readonly REDIS_PREFIX = "snapshot:";

    /**
     * Saves a full exam snapshot with server-authoritative timing and checksum validation.
     */
    public static async saveSnapshot(
        sessionId: number,
        payload: SnapshotPayload
    ): Promise<ExamSnapshot> {
        const client = await pool.connect();

        try {
            // Prevent race conditions
            await client.query(
                "SELECT pg_advisory_xact_lock($1)",
                [sessionId]
            );

            await client.query("BEGIN");

            // Fetch session timing info
            const sessionRes = await client.query(
                `
                SELECT started_at, duration_mins
                FROM interview_sessions
                WHERE id = $1
                `,
                [sessionId]
            );

            if (sessionRes.rowCount === 0) {
                throw new Error("Session not found");
            }

            const session = sessionRes.rows[0];

            // Compute timing
            const now = new Date();
            const startedAt = new Date(session.started_at);

            const durationSeconds =
                (session.duration_mins || 30) * 60;

            const timeElapsedSeconds = Math.floor(
                (now.getTime() - startedAt.getTime()) / 1000
            );

            const timeRemainingSeconds = Math.max(
                0,
                durationSeconds - timeElapsedSeconds
            );

            // Generate checksum
            const checksum = this.generateChecksum({
                ...payload,
                time_remaining_seconds: timeRemainingSeconds,
                session_id: sessionId
            });

            // Save snapshot
            const upsertRes = await client.query(
                `
                INSERT INTO exam_snapshots (
                    session_id,
                    candidate_id,
                    snapshot_version,
                    current_question_index,
                    questions_served,
                    answers_submitted,
                    current_theta,
                    skill_rotation_state,
                    time_elapsed_seconds,
                    exam_duration_seconds,
                    time_remaining_seconds,
                    checksum,
                    device_fingerprint_at_snapshot,
                    is_active,
                    last_heartbeat_at
                )
                VALUES (
                    $1,
                    (SELECT candidate_id FROM interview_sessions WHERE id = $1),
                    1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11,
                    true,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (session_id)
                DO UPDATE SET
                    snapshot_version = exam_snapshots.snapshot_version + 1,
                    current_question_index = EXCLUDED.current_question_index,
                    questions_served = EXCLUDED.questions_served,
                    answers_submitted = EXCLUDED.answers_submitted,
                    current_theta = EXCLUDED.current_theta,
                    skill_rotation_state = EXCLUDED.skill_rotation_state,
                    time_elapsed_seconds = EXCLUDED.time_elapsed_seconds,
                    time_remaining_seconds = EXCLUDED.time_remaining_seconds,
                    checksum = EXCLUDED.checksum,
                    device_fingerprint_at_snapshot =
                        EXCLUDED.device_fingerprint_at_snapshot,
                    last_heartbeat_at = CURRENT_TIMESTAMP
                RETURNING *
                `,
                [
                    sessionId,
                    payload.current_question_index,
                    JSON.stringify(payload.questions_served),
                    JSON.stringify(payload.answers_submitted),
                    payload.current_theta,
                    JSON.stringify(payload.skill_rotation_state),
                    timeElapsedSeconds,
                    durationSeconds,
                    timeRemainingSeconds,
                    checksum,
                    payload.device_fingerprint
                ]
            );

            const snapshot = upsertRes.rows[0] as ExamSnapshot;

            // Cache snapshot
            await redis.set(
                `${this.REDIS_PREFIX}${sessionId}`,
                JSON.stringify(snapshot),
                timeRemainingSeconds + 300
            );

            await client.query("COMMIT");

            return snapshot;
        } catch (error) {
            await client.query("ROLLBACK");

            console.error(
                `[ExamSnapshotService] saveSnapshot failed for session ${sessionId}:`,
                error
            );

            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Loads snapshot from Redis first, then PostgreSQL.
     */
    public static async loadSnapshot(
        sessionId: number
    ): Promise<ExamSnapshot | null> {

        // Redis cache
        const cached = await redis.get(
            `${this.REDIS_PREFIX}${sessionId}`
        );

        if (cached) {
            const snapshot = JSON.parse(cached) as ExamSnapshot;

            if (await this.validateSnapshotIntegrity(snapshot)) {
                return snapshot;
            }

            console.warn(
                `[ExamSnapshotService] Cache integrity failure for session ${sessionId}`
            );
        }

        // PostgreSQL fallback
        const result = await pool.query(
            `
            SELECT *
            FROM exam_snapshots
            WHERE session_id = $1
            AND is_active = true
            `,
            [sessionId]
        );

        if (result.rowCount === 0) {
            return null;
        }

        const snapshot = result.rows[0] as ExamSnapshot;

        return snapshot;
    }

    /**
     * Computes remaining time using only start time + duration.
     */
    public static async computeRemainingTime(
        sessionId: number
    ): Promise<number> {

        const result = await pool.query(
            `
            SELECT started_at, duration_mins
            FROM interview_sessions
            WHERE id = $1
            `,
            [sessionId]
        );

        if (result.rowCount === 0) {
            return 0;
        }

        const { started_at, duration_mins } = result.rows[0];

        const now = new Date();
        const start = new Date(started_at);

        const elapsedSeconds = Math.floor(
            (now.getTime() - start.getTime()) / 1000
        );

        const totalSeconds =
            (duration_mins || 30) * 60;

        return Math.max(
            0,
            totalSeconds - elapsedSeconds
        );
    }

    /**
     * Validates snapshot checksum.
     */
    public static async validateSnapshotIntegrity(
        snapshot: ExamSnapshot
    ): Promise<boolean> {

        const payload = {
            current_question_index:
                snapshot.current_question_index,

            questions_served:
                snapshot.questions_served,

            answers_submitted:
                snapshot.answers_submitted,

            current_theta:
                snapshot.current_theta,

            skill_rotation_state:
                snapshot.skill_rotation_state,

            device_fingerprint:
                snapshot.device_fingerprint_at_snapshot
        };

        const recomputed = this.generateChecksum({
            ...payload,
            time_remaining_seconds:
                snapshot.time_remaining_seconds,

            session_id:
                snapshot.session_id
        });

        const isValidChecksum =
            recomputed === snapshot.checksum;

        const isValidTime =
            snapshot.time_remaining_seconds <=
            snapshot.exam_duration_seconds;

        return isValidChecksum && isValidTime;
    }

    /**
     * Autosaves buffered answers.
     */
    public static async triggerAutoSave(
        sessionId: number
    ): Promise<void> {

        const buffered = await redis.get(
            `answer:buffer:${sessionId}`
        );

        if (!buffered) {
            return;
        }

        const {
            answers,
            index,
            theta,
            rotation,
            served,
            fingerprint
        } = JSON.parse(buffered);

        await this.saveSnapshot(sessionId, {
            current_question_index: index,
            questions_served: served,
            answers_submitted: answers,
            current_theta: theta,
            skill_rotation_state: rotation,
            device_fingerprint: fingerprint
        });
    }

    /**
     * Generates checksum.
     */
    private static generateChecksum(data: any): string {
        return crypto
            .createHash("sha256")
            .update(JSON.stringify(data))
            .digest("hex");
    }
}