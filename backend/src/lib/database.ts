import { Pool } from 'pg';

// -----------------------------------------------------------------------------
// ENV VALIDATION (dotenv is loaded in server.ts)
// -----------------------------------------------------------------------------
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add columns if they don't exist (for existing databases)
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS job_role TEXT`);
    await pool.query(`ALTER TABLE interview_tokens ADD COLUMN IF NOT EXISTS duration_mins INTEGER DEFAULT 5`);

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
        question_text TEXT,
        options JSONB,
        correct_answer TEXT,
        difficulty_level VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to interview_questions if they don't exist
    await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS interview_id TEXT`);
    await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS question_text TEXT`);
    await pool.query(`ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20)`);

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
