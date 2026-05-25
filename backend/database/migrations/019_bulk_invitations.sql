CREATE TABLE IF NOT EXISTS bulk_invite_jobs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  assessment_id INTEGER REFERENCES assessments(assessment_id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(job_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(userid) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bulk_invite_candidates (
  id SERIAL PRIMARY KEY,
  bulk_invite_job_id INTEGER NOT NULL REFERENCES bulk_invite_jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  job_role TEXT,
  custom_tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invite_logs (
  id SERIAL PRIMARY KEY,
  candidate_email TEXT NOT NULL,
  candidate_name TEXT,
  assessment_id INTEGER,
  token TEXT,
  status TEXT,
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bulk_invite_candidates_job_id ON bulk_invite_candidates (bulk_invite_job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_invite_candidates_email ON bulk_invite_candidates (email);
CREATE INDEX IF NOT EXISTS idx_invite_logs_email ON invite_logs (candidate_email);

ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';
ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS bulk_invite_job_id INTEGER REFERENCES bulk_invite_jobs(id) ON DELETE SET NULL;
