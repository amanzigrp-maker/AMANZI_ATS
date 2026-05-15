
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- --- SECTION 1: QUESTION BANK MANAGEMENT UPGRADES ---

-- Centralized Question Bank
CREATE TABLE IF NOT EXISTS question_bank (
    id SERIAL PRIMARY KEY,
    text_content TEXT NOT NULL,
    text_hash TEXT UNIQUE NOT NULL, -- Layer 1: Exact hash comparison
    normalized_text TEXT,           -- Layer 2: Pre-processed text
    skill_category VARCHAR(100) NOT NULL,
    subtopic VARCHAR(100),
    difficulty_level VARCHAR(20) NOT NULL, -- basic, medium, advanced, expert
    experience_level_years INTEGER DEFAULT 0,
    cognitive_level VARCHAR(50),    -- recall, apply, analyze, evaluate
    estimated_time_seconds INTEGER DEFAULT 60,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Question Embeddings (Section 1)
CREATE TABLE IF NOT EXISTS question_bank_embeddings (
    question_id INTEGER PRIMARY KEY REFERENCES question_bank(id) ON DELETE CASCADE,
    embedding VECTOR(768), -- Adjusted for Gemini Embedding model (768 or 1536)
    model_name VARCHAR(100) DEFAULT 'text-embedding-004',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Semantic Review Queue
CREATE TABLE IF NOT EXISTS question_similarity_reviews (
    id SERIAL PRIMARY KEY,
    source_question_id INTEGER REFERENCES question_bank(id),
    target_question_id INTEGER REFERENCES question_bank(id),
    similarity_score NUMERIC(8,6),
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved (duplicate), rejected (unique)
    reviewer_id INTEGER REFERENCES users(userid),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- --- SECTION 2: EXPERIENCE-BASED ENGINE UPGRADES ---

-- Enhanced Candidate Profile (Section 2)
CREATE TABLE IF NOT EXISTS candidate_ai_profiles (
    candidate_id INTEGER PRIMARY KEY REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    experience_level_years INTEGER,
    skill_confidence_scores JSONB DEFAULT '{}'::jsonb, -- { "React": 0.85, "Node": 0.72 }
    inferred_specialization TEXT,
    project_complexity_score FLOAT,
    leadership_indicators JSONB DEFAULT '[]'::jsonb,
    architecture_exposure_score FLOAT,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- --- SECTION 3: SESSION SECURITY & VALIDATION ---

-- Session State Machine (Section 3)
DO $$ BEGIN
    CREATE TYPE session_state AS ENUM (
        'CREATED', 'SENT', 'OPENED', 'VERIFIED', 'STARTED', 'ACTIVE', 'PAUSED', 'SUBMITTED', 'EXPIRED', 'BLOCKED', 'TERMINATED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Upgrade interview_sessions with state and security
ALTER TABLE interview_sessions 
ADD COLUMN IF NOT EXISTS state session_state DEFAULT 'CREATED',
ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS client_tz VARCHAR(50),
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

-- Audit Log for Session State Transitions
CREATE TABLE IF NOT EXISTS session_state_audit (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
    from_state session_state,
    to_state session_state,
    reason TEXT,
    triggered_by VARCHAR(50), -- 'system', 'recruiter', 'candidate'
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create HNSW index for vector similarity search (optimized for performance)
-- Note: Indexing depends on the vector size, adjusting for text-embedding-004
CREATE INDEX IF NOT EXISTS idx_question_embeddings_vector ON question_bank_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_question_bank_skill ON question_bank (skill_category, difficulty_level);
CREATE INDEX IF NOT EXISTS idx_question_bank_hash ON question_bank (text_hash);
CREATE INDEX IF NOT EXISTS idx_session_state ON interview_sessions (state);
