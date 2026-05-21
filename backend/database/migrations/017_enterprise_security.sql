CREATE TABLE IF NOT EXISTS enterprise_organizations (
  organization_id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  data_region TEXT DEFAULT 'IN',
  retention_policy JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
);

CREATE INDEX IF NOT EXISTS idx_enterprise_audit_created_at ON enterprise_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_session ON enterprise_audit_log (session_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_payload ON enterprise_audit_log USING GIN (payload);

CREATE TABLE IF NOT EXISTS enterprise_risk_scores (
  session_id TEXT PRIMARY KEY,
  candidate_id TEXT,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_band TEXT NOT NULL DEFAULT 'low',
  reasons JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enterprise_risk_band ON enterprise_risk_scores (risk_band, updated_at DESC);

CREATE TABLE IF NOT EXISTS enterprise_consent_records (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  candidate_id TEXT,
  consent_version TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enterprise_evidence_objects (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  candidate_id TEXT,
  object_type TEXT NOT NULL,
  storage_uri TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  encryption_key_ref TEXT,
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
