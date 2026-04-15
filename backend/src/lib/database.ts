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

    // Ensure interview_tokens table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_tokens (
        token TEXT PRIMARY KEY,
        candidate_email TEXT NOT NULL,
        candidate_name TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        device_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure interview_sessions table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE REFERENCES interview_tokens(token),
        candidate_email TEXT NOT NULL,
        role TEXT NOT NULL,
        experience_years INTEGER,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        is_submitted BOOLEAN DEFAULT FALSE,
        score INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 0
      )
    `);

    // Ensure interview_questions table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_questions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answer TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure interview_responses table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_responses (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
        question_id INTEGER REFERENCES interview_questions(id),
        selected_answer TEXT NOT NULL,
        is_correct BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    console.log('✅ AI Interview and Proctoring tables verified');

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
