-- Create proctoring_logs table if not exists
CREATE TABLE IF NOT EXISTS proctoring_logs (
    id SERIAL PRIMARY KEY,
    interview_id UUID NOT NULL,
    candidate_id UUID,
    type VARCHAR(50) NOT NULL,
    detail TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster retrieval
CREATE INDEX IF NOT EXISTS idx_proctoring_logs_interview_id ON proctoring_logs(interview_id);
