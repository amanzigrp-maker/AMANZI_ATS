
import { pool } from '../src/lib/database';

async function fix() {
  try {
    console.log("🛠️ Fixing IRT Schema...");
    
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

    // Ensure UNIQUE constraint exists for (candidate_email, skill)
    // We might need to drop the old unique constraint if it was on (candidate_id, skill)
    try {
        await pool.query(`
            ALTER TABLE candidate_skill_theta 
            ADD CONSTRAINT candidate_skill_theta_candidate_email_skill_key UNIQUE (candidate_email, skill)
        `);
    } catch (e) {
        console.log("ℹ️ Unique constraint might already exist or conflicting data present.");
    }

    console.log("✅ Schema updated successfully!");
  } catch (err) {
    console.error("❌ Schema fix failed:", err);
  } finally {
    process.exit();
  }
}

fix();
