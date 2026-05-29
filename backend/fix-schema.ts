
import { pool } from './src/lib/database';

async function fix() {
  try {
    console.log("🛠️ Fixing IRT Schema...");
    
    // Ensure questions table has correct difficulty columns if missing
    await pool.query(`
      ALTER TABLE questions 
      ADD COLUMN IF NOT EXISTS difficulty_b FLOAT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS discrimination_a FLOAT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS guessing_c FLOAT DEFAULT 0.25,
      ADD COLUMN IF NOT EXISTS skill_tag TEXT
    `);

    // Ensure candidate_skill_theta has candidate_email
    await pool.query(`
      ALTER TABLE candidate_skill_theta 
      ADD COLUMN IF NOT EXISTS candidate_email TEXT
    `);
    
    // Ensure irt_responses has candidate_email
    await pool.query(`
      ALTER TABLE irt_responses 
      ADD COLUMN IF NOT EXISTS candidate_email TEXT
    `);

    console.log("✅ Schema updated successfully!");
  } catch (err) {
    console.error("❌ Schema fix failed:", err);
  } finally {
    process.exit();
  }
}

fix();
