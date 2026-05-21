import { pool } from "../../lib/database";

let schemaReady: Promise<void> | null = null;

export const ensureEnterpriseSecuritySchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS enterprise_audit_log (
          id BIGSERIAL PRIMARY KEY,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          session_id TEXT,
          interview_id TEXT,
          candidate_id TEXT,
          tenant_id TEXT,
          actor_user_id TEXT,
          source TEXT,
          payload JSONB DEFAULT '{}'::jsonb,
          previous_hash TEXT NOT NULL,
          hash TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS enterprise_risk_scores (
          session_id TEXT PRIMARY KEY,
          candidate_id TEXT,
          score NUMERIC(5,2) NOT NULL DEFAULT 0,
          risk_band TEXT NOT NULL DEFAULT 'low',
          reasons JSONB DEFAULT '[]'::jsonb,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await pool.query("CREATE INDEX IF NOT EXISTS idx_enterprise_audit_created_at ON enterprise_audit_log (created_at DESC)");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_enterprise_risk_band ON enterprise_risk_scores (risk_band, updated_at DESC)");
    })();
  }

  return schemaReady;
};
