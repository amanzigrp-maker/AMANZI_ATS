import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// ENV VALIDATION (ensure dotenv is loaded before proceeding)
// -----------------------------------------------------------------------------
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
const {
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  NODE_ENV,
} = process.env;

const dbPortNum = Number(DB_PORT);
const dbNameTrimmed = typeof DB_NAME === 'string' ? DB_NAME.trim() : DB_NAME;

// -----------------------------------------------------------------------------
// CREATE POOL - Force explicit config to ensure PG16/5433 connection
// -----------------------------------------------------------------------------
export const pool = new Pool({
  host: DB_HOST || 'localhost',
  port: dbPortNum || 5433,
  database: dbNameTrimmed || 'amanzi_data',
  user: DB_USER || 'postgres',
  password: DB_PASSWORD || 'sagar123',
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// -----------------------------------------------------------------------------
// TEST CONNECTION
// -----------------------------------------------------------------------------
export const testConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    const info = await client.query(
      "SELECT current_database() AS db, inet_server_port() AS port, inet_server_addr()::text AS addr"
    );
    const row = info.rows?.[0] || {};
    console.log('🧭 DB connection info:', {
      db: row.db,
      port: row.port,
      addr: row.addr,
      usingDatabaseUrl: Boolean(DATABASE_URL),
      databaseUrlHas5433: typeof DATABASE_URL === 'string' ? DATABASE_URL.includes(':5433') : false,
      host: DB_HOST,
      dbName: DB_NAME,
      dbPort: DB_PORT,
    });
    client.release();

    console.log('✅ Database connected successfully');

    // Ensure interview_users table exists
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add columns if they don't exist (for existing databases)
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS job_role TEXT`);
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS duration_mins INTEGER DEFAULT 5`);
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS password TEXT`);
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 10`);
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS question_source TEXT DEFAULT 'ai'`);
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS assessment_id INTEGER`);

    // Ensure interview_sessions table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id SERIAL PRIMARY KEY,
        interview_user_id INTEGER REFERENCES interview_users(id),
        token TEXT UNIQUE REFERENCES interview_tokens(token),
        candidate_email TEXT NOT NULL,
        interview_id TEXT,
        role TEXT NOT NULL,
        experience_years INTEGER,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'in_progress',
        is_submitted BOOLEAN DEFAULT FALSE,
        score INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Add new columns to interview_sessions if they don't exist
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS interview_user_id INTEGER REFERENCES interview_users(id)`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS end_time TIMESTAMP`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'in_progress'`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS interview_id TEXT`);

    // Ensure interview_questions table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_questions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        interview_id TEXT,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        difficulty VARCHAR(20) DEFAULT 'medium',
        correct_answer TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add difficulty column if it doesn't exist
    await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'medium'`);
    await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS options JSONB`);

    // Ensure interview_responses table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_responses (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        question_id INTEGER REFERENCES interview_questions(id),
        selected_answer TEXT,
        response TEXT,
        is_correct BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to interview_responses if they don't exist
    await pool.query(`ALTER TABLE interview_responses ADD COLUMN IF NOT EXISTS response TEXT`);

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

    console.log('✅ Temporary Interview Access System tables verified');

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
        correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
        review_status TEXT DEFAULT 'approved',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS question_options (
        option_id SERIAL PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
        option_key TEXT NOT NULL CHECK (option_key IN ('A', 'B', 'C', 'D')),
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
        submitted_at TIMESTAMPTZ
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_answers (
        answer_id SERIAL PRIMARY KEY,
        attempt_id INTEGER NOT NULL REFERENCES candidate_attempts(attempt_id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES questions(question_id),
        selected_option TEXT CHECK (selected_option IN ('A', 'B', 'C', 'D')),
        is_correct BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(attempt_id, question_id)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_metadata_gin ON questions USING GIN (metadata)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_sets_assessment ON question_sets (assessment_id)`);

    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed');
    console.error({
      message: error.message,
      code: error.code,
      user: DB_USER || 'FROM_DATABASE_URL',
      host: DB_HOST,
      database: DB_NAME,
    });
    return false;
  }
};

// -----------------------------------------------------------------------------
// CLOSE POOL
// -----------------------------------------------------------------------------
export const closePool = async (): Promise<void> => {
  await pool.end();
};

export default pool;
