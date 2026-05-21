import crypto from "crypto";
import { pool } from "../../lib/database";
import { ensureEnterpriseSecuritySchema } from "./schema";
class SecureAuditService {
    async append(event) {
        await ensureEnterpriseSecuritySchema();
        const previous = await pool.query("SELECT hash FROM enterprise_audit_log ORDER BY id DESC LIMIT 1").catch(() => ({ rows: [] }));
        const previousHash = previous.rows[0]?.hash ?? "GENESIS";
        const payload = JSON.stringify(event.payload ?? {});
        const content = [
            previousHash,
            event.eventType,
            event.severity ?? "info",
            event.sessionId ?? "",
            event.interviewId ?? "",
            event.candidateId ?? "",
            event.tenantId ?? "",
            event.actorUserId ?? "",
            payload,
            event.createdAt ?? "",
        ].join("|");
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        await pool.query(`INSERT INTO enterprise_audit_log
        (event_type, severity, session_id, interview_id, candidate_id, tenant_id, actor_user_id, source, payload, previous_hash, hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,COALESCE($12::timestamptz, NOW()))`, [
            event.eventType,
            event.severity ?? "info",
            event.sessionId ? String(event.sessionId) : null,
            event.interviewId ?? null,
            event.candidateId ? String(event.candidateId) : null,
            event.tenantId ? String(event.tenantId) : null,
            event.actorUserId ? String(event.actorUserId) : null,
            event.source ?? "backend",
            payload,
            previousHash,
            hash,
            event.createdAt ?? null,
        ]).catch((error) => {
            console.error("Failed to append enterprise audit event:", error);
        });
    }
}
export const secureAuditService = new SecureAuditService();
