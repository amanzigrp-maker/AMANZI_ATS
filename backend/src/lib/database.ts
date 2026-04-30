import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load ENV from the project root .env (three levels up from src/lib)
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

// Destructure ENV
const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  NODE_ENV,
} = process.env;

// -----------------------------------------------------------------------------
// VALIDATION (NO SILENT FAILURES)
// -----------------------------------------------------------------------------
function validateEnv() {
  const missing = [];

  if (!DB_HOST) missing.push("DB_HOST");
  if (!DB_PORT) missing.push("DB_PORT");
  if (!DB_NAME) missing.push("DB_NAME");
  if (!DB_USER) missing.push("DB_USER");
  if (!DB_PASSWORD) missing.push("DB_PASSWORD");

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
  host: DB_HOST,
  port: Number(DB_PORT),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  ssl: NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 3000,
});

// -----------------------------------------------------------------------------
// TEST CONNECTION (FAST + CLEAN)
// -----------------------------------------------------------------------------
export async function testConnection(): Promise<boolean> {
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        candidate_phone TEXT
      )
    `);

    // Add columns if they don't exist (for existing databases)
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS candidate_phone TEXT`);
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
        completed_at TIMESTAMP,
        candidate_phone TEXT
      )
    `);

    // Add new columns to interview_sessions if they don't exist
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS candidate_phone TEXT`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS interview_user_id INTEGER REFERENCES interview_users(id)`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS end_time TIMESTAMP`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'in_progress'`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS interview_id TEXT`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS current_theta NUMERIC(6,4) DEFAULT 0.5`);
    await pool.query(`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS target_questions INTEGER DEFAULT 10`);

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

    await pool.query(`ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_correct_option_check`).catch(() => {});
    await pool.query(`ALTER TABLE question_options DROP CONSTRAINT IF EXISTS question_options_option_key_check`).catch(() => {});
    await pool.query(`ALTER TABLE candidate_answers DROP CONSTRAINT IF EXISTS candidate_answers_selected_option_check`).catch(() => {});
    
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_metadata_gin ON questions USING GIN (metadata)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_sets_assessment ON question_sets (assessment_id)`);
    await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_score NUMERIC(6,4) DEFAULT 0.5`);

    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`).catch((error) => {
      console.warn('Vector extension check skipped:', error instanceof Error ? error.message : error);
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS question_embeddings (
        question_id INTEGER PRIMARY KEY REFERENCES questions(question_id) ON DELETE CASCADE,
        assessment_id INTEGER NOT NULL REFERENCES assessments(assessment_id) ON DELETE CASCADE,
        topic TEXT,
        content TEXT,
        embedding VECTOR(384),
        model_name TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`ALTER TABLE question_embeddings ADD COLUMN IF NOT EXISTS topic TEXT`);
    await pool.query(`ALTER TABLE question_embeddings ADD COLUMN IF NOT EXISTS content TEXT`);
    await pool.query(`ALTER TABLE question_embeddings ADD COLUMN IF NOT EXISTS model_name TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_embeddings_assessment ON question_embeddings (assessment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_embeddings_topic ON question_embeddings (topic)`);

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
    `).catch(() => {});

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
    `).catch(() => {});

    return true;
  } catch (error: any) {
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

