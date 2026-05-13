import { pool } from '../src/lib/database';

async function fullHealthCheck() {
  console.log("🔍 Starting Full System Health Check...");
  
  const tables = [
    'users', 'refresh_tokens', 'loginaudit', 
    'interview_users', 'interview_tokens', 'interview_sessions', 
    'interview_questions', 'interview_responses', 'interview_verifications',
    'assessments', 'question_sets', 'questions', 'question_options',
    'candidate_attempts', 'candidate_answers', 'certificates'
  ];

  for (const table of tables) {
    try {
      const res = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [table]);
      if (res.rowCount === 0) {
        console.error(`❌ Table MISSING: ${table}`);
      } else {
        console.log(`✅ Table OK: ${table}`);
      }
    } catch (e: any) {
      console.error(`❌ Error checking table ${table}:`, e.message);
    }
  }

  // Check critical columns in users
  try {
    const res = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
    const cols = res.rows.map(r => r.column_name);
    const required = ['userid', 'email', 'passwordhash', 'role', 'status'];
    for (const r of required) {
       if (!cols.includes(r)) console.error(`❌ Missing column in users: ${r}`);
    }
  } catch (e) {}

  console.log("🔍 Health Check Complete.");
  await pool.end();
}

fullHealthCheck();
