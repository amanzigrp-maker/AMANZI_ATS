import { Pool } from "pg";
import { config, isProduction } from "../config/env.config";
// -----------------------------------------------------------------------------
// VALIDATION (NO SILENT FAILURES)
// -----------------------------------------------------------------------------
function validateEnv() {
    const missing = [];
    if (!config.DB_HOST)
        missing.push("DB_HOST");
    if (!config.DB_PORT)
        missing.push("DB_PORT");
    if (!config.DB_NAME)
        missing.push("DB_NAME");
    if (!config.DB_USER)
        missing.push("DB_USER");
    if (!config.DB_PASSWORD)
        missing.push("DB_PASSWORD");
    if (missing.length > 0) {
        console.error("❌ Missing ENV variables:");
        missing.forEach((key) => console.error(`   - ${key}`));
        console.log("\n📌 Fix:");
        console.log("1. Copy .env.example → .env");
        console.log("2. Fill correct DB values\n");
        process.exit(1); // STOP APP
    }
}
validateEnv();
// -----------------------------------------------------------------------------
// CREATE POOL
// -----------------------------------------------------------------------------
export const pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 3000,
});
// -----------------------------------------------------------------------------
// TEST CONNECTION (FAST + CLEAN)
// -----------------------------------------------------------------------------
export async function testConnection() {
    try {
        const client = await pool.connect();
        const res = await client.query("SELECT current_database(), inet_server_port()");
        const row = res.rows[0];
        console.log("✅ DB Connected:");
        console.log(`   Database: ${row.current_database}`);
        console.log(`   Port: ${row.inet_server_port}`);
        client.release();
        console.log("✅ Database connected successfully");
        console.log('✅ Database connected successfully');
        // Ensure core authentication tables exist
        console.log('📦 Verifying core auth tables...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        userid SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        passwordhash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'recruiter',
        status TEXT DEFAULT 'active',
        createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        lastlogin TIMESTAMP,
        created_by INTEGER
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(userid) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expiry TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS loginaudit (
        auditid SERIAL PRIMARY KEY,
        userid INTEGER,
        ipaddress TEXT,
        deviceinfo TEXT,
        loginstatus TEXT,
        attempted_email TEXT,
        logintime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Ensure interview_users table exists
        console.log('📦 Verifying interview tables...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP NOT NULL,
        interview_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('📦 Verifying interview tokens and session tables...');
        // Ensure interview_tokens table exists with new columns
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_tokens (
        token TEXT PRIMARY KEY,
        candidate_email TEXT NOT NULL,
        candidate_name TEXT NOT NULL,
        job_role TEXT,
        duration_mins INTEGER DEFAULT 5,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        device_id TEXT,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        candidate_phone TEXT,
        created_by INTEGER
      )
    `);
        // Add columns if they don't exist (for existing databases)
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS candidate_phone TEXT`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS created_by INTEGER`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS job_role TEXT`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS duration_mins INTEGER DEFAULT 5`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS password TEXT`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 10`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS question_source TEXT DEFAULT 'ai'`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS assessment_id INTEGER`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS candidate_id INTEGER REFERENCES candidates(candidate_id)`);
        // Ensure interview_sessions table exists
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id SERIAL PRIMARY KEY,
        interview_user_id INTEGER REFERENCES interview_users(id),
        token TEXT UNIQUE REFERENCES interview_tokens(token),
        candidate_email TEXT NOT NULL,
        candidate_name TEXT,
        interview_id TEXT,
        role TEXT NOT NULL,
        experience_years INTEGER,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'in_progress',
        state VARCHAR(50) DEFAULT 'CREATED',
        is_submitted BOOLEAN DEFAULT FALSE,
        score INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        paused_at TIMESTAMP,
        resumed_at TIMESTAMP,
        total_paused_duration_ms BIGINT DEFAULT 0,
        expires_at TIMESTAMP,
        last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        remaining_seconds INTEGER,
        fingerprint_hash TEXT,
        current_theta NUMERIC(6,4) DEFAULT 0.5,
        target_questions INTEGER DEFAULT 10,
        completed_at TIMESTAMP,
        candidate_phone TEXT,
        device_info JSONB,
        ip_address TEXT,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);
        // Add new columns to interview_sessions if they don't exist
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS state VARCHAR(50) DEFAULT 'CREATED'`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMP`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS total_paused_duration_ms BIGINT DEFAULT 0`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS remaining_seconds INTEGER`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS device_info JSONB`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS candidate_name TEXT`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS target_questions INTEGER DEFAULT 10`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS current_theta NUMERIC(6,4) DEFAULT 0.5`);
        // Ensure interview_questions table exists
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_questions (
          id SERIAL PRIMARY KEY,
          session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
          interview_id TEXT,
          question TEXT NOT NULL,
          options JSONB NOT NULL,
          question_type VARCHAR(20) DEFAULT 'single',
          difficulty VARCHAR(20) DEFAULT 'medium',
          correct_answer TEXT NOT NULL,
          correct_answers JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
        // Add difficulty column if it doesn't exist
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'medium'`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS options JSONB`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'single'`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS source_question_id INTEGER`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS difficulty_score NUMERIC(6,4) DEFAULT 0.5`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS selection_mode TEXT`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS semantic_similarity NUMERIC(8,6)`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS semantic_topic TEXT`);
        await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS correct_answers JSONB`);
        // Ensure interview_responses table exists
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_responses (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        question_id INTEGER REFERENCES interview_questions(id),
        selected_answer TEXT,
        selected_answers JSONB,
        response TEXT,
        is_correct BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        question_text TEXT,
        answer_text TEXT
      )
    `);
        // Add new columns to interview_responses if they don't exist
        await pool.query(`ALTER TABLE interview_responses ADD COLUMN IF NOT EXISTS question_text TEXT`);
        await pool.query(`ALTER TABLE interview_responses ADD COLUMN IF NOT EXISTS answer_text TEXT`);
        await pool.query(`ALTER TABLE interview_responses ADD COLUMN IF NOT EXISTS response TEXT`);
        await pool.query(`ALTER TABLE interview_responses ADD COLUMN IF NOT EXISTS selected_answers JSONB`);
        await pool.query(`ALTER TABLE interview_responses ADD COLUMN IF NOT EXISTS theta_before NUMERIC(6,4)`);
        await pool.query(`ALTER TABLE interview_responses ADD COLUMN IF NOT EXISTS theta_after NUMERIC(6,4)`);
        // Ensure proctoring_logs table exists
        await pool.query(`
      CREATE TABLE IF NOT EXISTS proctoring_logs (
        id SERIAL PRIMARY KEY,
        interview_id TEXT NOT NULL,
        candidate_id TEXT,
        type VARCHAR(50) NOT NULL,
        detail TEXT,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_verifications (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE REFERENCES interview_tokens(token) ON DELETE CASCADE,
        candidate_id INTEGER,
        candidate_email TEXT,
        selfie_path TEXT,
        id_card_path TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`ALTER TABLE interview_verifications ADD COLUMN IF NOT EXISTS candidate_id INTEGER`);
        await pool.query(`ALTER TABLE interview_verifications ADD COLUMN IF NOT EXISTS candidate_email TEXT`);
        await pool.query(`ALTER TABLE interview_verifications ADD COLUMN IF NOT EXISTS selfie_path TEXT`);
        await pool.query(`ALTER TABLE interview_verifications ADD COLUMN IF NOT EXISTS id_card_path TEXT`);
        await pool.query(`ALTER TABLE interview_verifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
        // --- FAULT RECOVERY & RESUMPTION TABLES ---
        console.log('📦 Verifying fault recovery tables...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_session_runtime (
        session_id INTEGER PRIMARY KEY REFERENCES interview_sessions(id) ON DELETE CASCADE,
        current_question_index INTEGER DEFAULT 0,
        current_question_id INTEGER,
        navigation_state JSONB DEFAULT '{}'::jsonb,
        coding_state JSONB DEFAULT '{}'::jsonb,
        adaptive_state JSONB DEFAULT '{}'::jsonb,
        last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_session_snapshots (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        snapshot_data JSONB NOT NULL,
        trigger_event TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_reconnect_logs (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        event_type VARCHAR(50),
        ip_address TEXT,
        user_agent TEXT,
        fingerprint_hash TEXT,
        status VARCHAR(20),
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_heartbeat_logs (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        latency_ms INTEGER,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_autosave_events (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        question_id INTEGER,
        response_data JSONB,
        is_draft BOOLEAN DEFAULT TRUE,
        client_timestamp TIMESTAMP,
        server_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS session_resume_audit (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        previous_state TEXT,
        new_state TEXT,
        resume_point_question_id INTEGER,
        recovered_fields TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS adaptive_engine_snapshots (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        theta NUMERIC(10,6),
        question_sequence INTEGER[],
        skill_rotation_state JSONB,
        theta_history JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS session_state_audit (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        from_state VARCHAR(50),
        to_state VARCHAR(50),
        reason TEXT,
        triggered_by VARCHAR(100),
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ Fault recovery tables verified');
        // Add decision column for select/reject status
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS decision TEXT DEFAULT 'pending'`);
        await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS feedback TEXT`);
        // Recruiter assessment/question bank tables
        await pool.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        assessment_id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        role TEXT,
        duration_minutes INTEGER DEFAULT 30,
        status TEXT DEFAULT 'draft',
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS question_sets (
        question_set_id SERIAL PRIMARY KEY,
        assessment_id INTEGER NOT NULL REFERENCES assessments(assessment_id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Default section',
        source_type TEXT NOT NULL CHECK (source_type IN ('ai', 'upload')),
        source_file TEXT,
        prompt TEXT,
        review_status TEXT DEFAULT 'draft',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        question_id SERIAL PRIMARY KEY,
        question_set_id INTEGER NOT NULL REFERENCES question_sets(question_set_id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        difficulty TEXT DEFAULT 'medium',
        topic TEXT,
        explanation TEXT,
        correct_option TEXT NOT NULL,
        review_status TEXT DEFAULT 'approved',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS question_options (
        option_id SERIAL PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
        option_key TEXT NOT NULL,
        option_text TEXT NOT NULL,
        UNIQUE(question_id, option_key)
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_attempts (
        attempt_id SERIAL PRIMARY KEY,
        assessment_id INTEGER NOT NULL REFERENCES assessments(assessment_id) ON DELETE CASCADE,
        candidate_id INTEGER,
        candidate_email TEXT,
        status TEXT DEFAULT 'in_progress',
        score NUMERIC(6,2) DEFAULT 0,
        total_questions INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        submitted_at TIMESTAMPTZ,
        candidate_phone TEXT
      )
    `);
        // Add phone column to candidate_attempts if it doesn't exist
        await pool.query(`ALTER TABLE candidate_attempts ADD COLUMN IF NOT EXISTS candidate_phone TEXT`);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_answers (
        answer_id SERIAL PRIMARY KEY,
        attempt_id INTEGER NOT NULL REFERENCES candidate_attempts(attempt_id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES questions(question_id),
        selected_option TEXT,
        is_correct BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        question_text TEXT,
        selected_option_text TEXT,
        UNIQUE(attempt_id, question_id)
      )
    `);
        // Add snapshot columns to candidate_answers if they don't exist
        await pool.query(`ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS question_text TEXT`);
        await pool.query(`ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS selected_option_text TEXT`);
        await pool.query(`ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_correct_option_check`).catch(() => { });
        await pool.query(`ALTER TABLE question_options DROP CONSTRAINT IF EXISTS question_options_option_key_check`).catch(() => { });
        await pool.query(`ALTER TABLE candidate_answers DROP CONSTRAINT IF EXISTS candidate_answers_selected_option_check`).catch(() => { });
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_metadata_gin ON questions USING GIN (metadata)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_sets_assessment ON question_sets (assessment_id)`);
        await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_score NUMERIC(6,4) DEFAULT 0.5`);
        // await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`).catch((error) => {
        //   console.warn('Vector extension check skipped:', error instanceof Error ? error.message : error);
        // });
        // await pool.query(`
        //   CREATE TABLE IF NOT EXISTS question_embeddings (
        //     question_id INTEGER PRIMARY KEY REFERENCES questions(question_id) ON DELETE CASCADE,
        //     assessment_id INTEGER NOT NULL REFERENCES assessments(assessment_id) ON DELETE CASCADE,
        //     topic TEXT,
        //     content TEXT,
        //     embedding VECTOR(384),
        //     model_name TEXT,
        //     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        //   )
        // `);
        // await pool.query(`ALTER TABLE question_embeddings ADD COLUMN IF NOT EXISTS topic TEXT`);
        // await pool.query(`ALTER TABLE question_embeddings ADD COLUMN IF NOT EXISTS content TEXT`);
        // await pool.query(`ALTER TABLE question_embeddings ADD COLUMN IF NOT EXISTS model_name TEXT`);
        // await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_embeddings_assessment ON question_embeddings (assessment_id)`);
        // await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_embeddings_topic ON question_embeddings (topic)`);
        // --- IRT (Item Response Theory) TABLES ---
        // 1. Update questions table with IRT parameters
        await pool.query(`
      ALTER TABLE questions 
      ADD COLUMN IF NOT EXISTS skill_tag TEXT,
      ADD COLUMN IF NOT EXISTS difficulty_b FLOAT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS discrimination_a FLOAT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS guessing_c FLOAT DEFAULT 0.25,
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL'
    `);
        // 2. Candidate Ability Tracking (Theta)
        await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_skill_theta (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER,
        candidate_email TEXT,
        skill TEXT NOT NULL,
        theta FLOAT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(candidate_email, skill)
      )
    `);
        // Ensure candidate_email column exists for older table versions
        await pool.query(`
      ALTER TABLE candidate_skill_theta ADD COLUMN IF NOT EXISTS candidate_email TEXT;
      ALTER TABLE candidate_skill_theta ALTER COLUMN candidate_id DROP NOT NULL;
    `).catch(() => { });
        // 3. Normalized IRT Responses for Calibration
        await pool.query(`
      CREATE TABLE IF NOT EXISTS irt_responses (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER,
        candidate_email TEXT,
        question_id INTEGER REFERENCES questions(question_id),
        is_correct BOOLEAN NOT NULL,
        response_time_ms INTEGER,
        theta_before FLOAT,
        theta_after FLOAT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      ALTER TABLE irt_responses ADD COLUMN IF NOT EXISTS candidate_email TEXT;
      ALTER TABLE irt_responses ALTER COLUMN candidate_id DROP NOT NULL;
      ALTER TABLE irt_responses ADD COLUMN IF NOT EXISTS question_text TEXT;
    `).catch(() => { });
        // Ensure certificates table exists
        await pool.query(`
      CREATE TABLE IF NOT EXISTS certificates (
        id SERIAL PRIMARY KEY,
        certificate_id TEXT UNIQUE NOT NULL,
        interview_session_id INTEGER REFERENCES interview_sessions(id),
        candidate_name TEXT NOT NULL,
        candidate_email TEXT NOT NULL,
        candidate_photo TEXT,
        test_name TEXT NOT NULL,
        score NUMERIC(6,2) NOT NULL,
        issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        verification_token TEXT,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);
        // Ensure question_bank table exists for Auto Question Shelf System
        console.log('📦 Verifying question_bank table...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS question_bank (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        question_text TEXT NOT NULL,
        normalized_hash VARCHAR(64) UNIQUE NOT NULL,
        options JSONB NOT NULL,
        correct_answer VARCHAR(10) NOT NULL,
        difficulty VARCHAR(20) DEFAULT 'medium',
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_bank_category ON question_bank (category)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_bank_hash ON question_bank (normalized_hash)`);
        // --- SAVED QUESTION PAPER LIBRARY ---
        console.log('📦 Verifying question_papers tables...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS question_papers (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(userid) ON DELETE SET NULL,
        organization_id INTEGER,
        assessment_id INTEGER REFERENCES assessments(assessment_id) ON DELETE SET NULL,
        total_questions INTEGER DEFAULT 0,
        difficulty_distribution JSONB DEFAULT '{}'::jsonb,
        tags TEXT[] DEFAULT '{}',
        subject TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        is_template BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'active',
        visibility TEXT DEFAULT 'private',
        usage_count INTEGER DEFAULT 0
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS question_paper_questions (
        id SERIAL PRIMARY KEY,
        question_paper_id INTEGER NOT NULL REFERENCES question_papers(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        difficulty TEXT DEFAULT 'medium',
        topic TEXT,
        explanation TEXT,
        correct_option TEXT NOT NULL,
        options JSONB NOT NULL,
        difficulty_score NUMERIC(6,4) DEFAULT 0.5,
        order_index INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_papers_created_by ON question_papers (created_by)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_papers_subject ON question_papers (subject)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_paper_questions_paper_id ON question_paper_questions (question_paper_id)`);
        // --- BULK INVITATION SYSTEM ---
        console.log('📦 Verifying bulk invitation tables...');
        await pool.query(`
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
      )
    `);
        await pool.query(`
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
      )
    `);
        await pool.query(`
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
      )
    `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_invite_candidates_job_id ON bulk_invite_candidates (bulk_invite_job_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_invite_candidates_email ON bulk_invite_candidates (email)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_invite_logs_email ON invite_logs (candidate_email)`);
        // Add status column and bulk_invite_job_id column to interview_tokens if they don't exist
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent'`);
        await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS bulk_invite_job_id INTEGER REFERENCES bulk_invite_jobs(id) ON DELETE SET NULL`);
        return true;
    }
    catch (error) {
        console.error("\n❌ DATABASE CONNECTION FAILED\n");
        console.error("Reason:", error.message);
        console.log("\n📌 Check:");
        console.log("1. PostgreSQL is running");
        console.log("2. DB credentials are correct");
        console.log("3. Port is correct (usually 5432)");
        console.log("4. DB exists\n");
        return false;
    }
}
// -----------------------------------------------------------------------------
// GRACEFUL SHUTDOWN
// -----------------------------------------------------------------------------
export async function closePool() {
    await pool.end();
}
export default pool;
