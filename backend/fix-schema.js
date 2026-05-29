
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'amanzi_data'
};

console.log(`Connecting to database ${config.database} on ${config.host}:${config.port}...`);

const pool = new pg.Pool(config);

async function fix() {
  try {
    console.log("🛠️ Fixing IRT Schema via raw SQL...");
    
    await pool.query(`
      ALTER TABLE candidate_skill_theta 
      ADD COLUMN IF NOT EXISTS candidate_email TEXT;
      
      ALTER TABLE irt_responses 
      ADD COLUMN IF NOT EXISTS candidate_email TEXT;

      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_skill_theta_candidate_email_skill_key') THEN
          ALTER TABLE candidate_skill_theta 
          ADD CONSTRAINT candidate_skill_theta_candidate_email_skill_key UNIQUE(candidate_email, skill);
        END IF;
      END $$;
    `);

    console.log("✅ Schema updated successfully!");
  } catch (err) {
    console.error("❌ Schema fix failed:", err);
  } finally {
    await pool.end();
    process.exit();
  }
}

fix();
