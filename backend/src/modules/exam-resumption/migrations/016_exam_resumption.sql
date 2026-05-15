
-- SECTION A: Exam Resumption & Crash Recovery Schema

-- 1. Snapshot Table
CREATE TABLE IF NOT EXISTS exam_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id INT UNIQUE NOT NULL,
    candidate_id INT NOT NULL,
    snapshot_version INT NOT NULL DEFAULT 1,
    current_question_index INT NOT NULL DEFAULT 0,
    questions_served JSONB NOT NULL DEFAULT '[]',
    answers_submitted JSONB NOT NULL DEFAULT '{}',
    current_theta NUMERIC(10, 4) NOT NULL DEFAULT 0.5,
    skill_rotation_state JSONB NOT NULL DEFAULT '{}',
    time_elapsed_seconds INT NOT NULL DEFAULT 0,
    exam_duration_seconds INT NOT NULL,
    time_remaining_seconds INT NOT NULL,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    snapshot_taken_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resume_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    device_fingerprint_at_snapshot TEXT,
    server_node_id TEXT,
    checksum TEXT NOT NULL
);

-- Indexes for snapshots
CREATE INDEX IF NOT EXISTS idx_exam_snapshots_session_id ON exam_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_snapshots_candidate_id ON exam_snapshots(candidate_id);
CREATE INDEX IF NOT EXISTS idx_exam_snapshots_is_active ON exam_snapshots(is_active);
CREATE INDEX IF NOT EXISTS idx_exam_snapshots_active_partial ON exam_snapshots(session_id) WHERE is_active = true;

-- 2. Disruption Events Table
CREATE TYPE disruption_type_enum AS ENUM (
    'NETWORK_DROP', 'BROWSER_CRASH', 'TAB_CLOSE', 'DEVICE_REBOOT', 
    'INACTIVITY', 'SERVER_RESTART', 'MANUAL_DISCONNECT', 'UNKNOWN'
);

CREATE TABLE IF NOT EXISTS exam_disruption_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id INT NOT NULL,
    candidate_id INT NOT NULL,
    disruption_type disruption_type_enum NOT NULL,
    disrupted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resumed_at TIMESTAMP WITH TIME ZONE,
    time_lost_seconds INT DEFAULT 0,
    resume_device_fingerprint TEXT,
    ip_at_disruption TEXT,
    ip_at_resume TEXT,
    was_suspicious BOOLEAN DEFAULT false,
    recruiter_notified BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_exam_disruptions_session_id ON exam_disruption_events(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_disruptions_disrupted_at ON exam_disruption_events(disrupted_at);

-- 3. Heartbeats Table (High-write optimized)
CREATE TYPE visibility_state_enum AS ENUM ('VISIBLE', 'HIDDEN', 'UNKNOWN');
CREATE TYPE network_quality_enum AS ENUM ('EXCELLENT', 'GOOD', 'POOR', 'OFFLINE');

CREATE TABLE IF NOT EXISTS exam_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    session_id INT NOT NULL,
    candidate_id INT NOT NULL,
    heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    client_reported_remaining_seconds INT,
    server_computed_remaining_seconds INT NOT NULL,
    page_visibility_state visibility_state_enum DEFAULT 'UNKNOWN',
    network_quality network_quality_enum
);

-- Note: Partitioning usually requires specific DB setup (e.g. pg_partman). 
-- For this monolithic implementation, we ensure high-performance indexing.
CREATE INDEX IF NOT EXISTS idx_exam_heartbeats_session_recent ON exam_heartbeats(session_id, heartbeat_at DESC);

-- 4. Audit Log for State Transitions
CREATE TABLE IF NOT EXISTS exam_state_audit (
    id BIGSERIAL PRIMARY KEY,
    session_id INT NOT NULL,
    old_state TEXT,
    new_state TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
