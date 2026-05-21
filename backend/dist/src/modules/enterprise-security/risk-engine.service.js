import { pool } from "../../lib/database";
import { ensureEnterpriseSecuritySchema } from "./schema";
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
class EnterpriseRiskEngine {
    scoreBehavior(signal) {
        const reasons = [];
        let score = 0;
        const add = (points, reason) => {
            score += points;
            reasons.push(reason);
        };
        if ((signal.typingSpeedWpm ?? 0) > 110)
            add(12, "Unusually high typing speed");
        if ((signal.answerTimeMs ?? Number.MAX_SAFE_INTEGER) < 4000)
            add(14, "Answer submitted unusually quickly");
        if ((signal.mouseLinearity ?? 0) > 0.92)
            add(10, "Mouse movement appears mechanically linear");
        if ((signal.idleMs ?? 0) > 120000)
            add(8, "Long inactivity interval");
        if ((signal.pasteCount ?? 0) > 0)
            add(Math.min(25, (signal.pasteCount ?? 0) * 8), "Paste activity detected");
        if ((signal.gazeAwayRatio ?? 0) > 0.35)
            add(16, "Repeated gaze away from screen");
        if ((signal.webcamInactiveMs ?? 0) > 30000)
            add(18, "Webcam inactive during assessment");
        if ((signal.tabSwitchCount ?? 0) > 0)
            add(Math.min(30, (signal.tabSwitchCount ?? 0) * 10), "Tab or visibility switching detected");
        if ((signal.llmPatternScore ?? 0) > 0.7)
            add(18, "Answer structure resembles AI-assisted output");
        if ((signal.violationCount ?? 0) > 0)
            add(Math.min(35, (signal.violationCount ?? 0) * 12), "Prior proctoring violations");
        const normalized = clamp(score);
        return {
            candidateId: null,
            score: normalized,
            riskBand: normalized >= 85 ? "critical" : normalized >= 65 ? "high" : normalized >= 35 ? "medium" : "low",
            reasons,
        };
    }
    async updateFromEvent(event) {
        await ensureEnterpriseSecuritySchema();
        const sessionId = String(event.sessionId ?? event.interviewId ?? "");
        if (!sessionId)
            return null;
        const signal = (event.payload?.behaviorSignal ?? event.payload ?? {});
        if (event.eventType === "proctoring.violation") {
            signal.violationCount = Math.max(signal.violationCount ?? 0, 1);
        }
        if (event.eventType === "secure_browser.process_detected") {
            signal.violationCount = Math.max(signal.violationCount ?? 0, 2);
        }
        const scored = this.scoreBehavior(signal);
        const risk = {
            ...scored,
            sessionId,
            candidateId: event.candidateId ? String(event.candidateId) : null,
            updatedAt: new Date().toISOString(),
        };
        await pool.query(`INSERT INTO enterprise_risk_scores (session_id, candidate_id, score, risk_band, reasons, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET candidate_id = EXCLUDED.candidate_id, score = EXCLUDED.score, risk_band = EXCLUDED.risk_band,
         reasons = EXCLUDED.reasons, updated_at = NOW()`, [risk.sessionId, risk.candidateId, risk.score, risk.riskBand, JSON.stringify(risk.reasons)]).catch((error) => {
            console.error("Failed to persist enterprise risk score:", error);
        });
        return risk;
    }
    async getSummary() {
        await ensureEnterpriseSecuritySchema();
        const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE risk_band IN ('high','critical'))::int AS escalated_sessions,
        COALESCE(ROUND(AVG(score), 2), 0)::float AS average_score,
        COALESCE(MAX(score), 0)::float AS max_score
      FROM enterprise_risk_scores
    `).catch(() => ({ rows: [{ total_sessions: 0, escalated_sessions: 0, average_score: 0, max_score: 0 }] }));
        return result.rows[0];
    }
    async getRecent(limit = 25) {
        await ensureEnterpriseSecuritySchema();
        const result = await pool.query(`SELECT session_id, candidate_id, score, risk_band, reasons, updated_at
       FROM enterprise_risk_scores
       ORDER BY updated_at DESC
       LIMIT $1`, [limit]).catch(() => ({ rows: [] }));
        return result.rows;
    }
}
export const enterpriseRiskEngine = new EnterpriseRiskEngine();
