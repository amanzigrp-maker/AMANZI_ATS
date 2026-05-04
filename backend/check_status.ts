import { pool } from './src/lib/database';

async function checkStatus() {
  try {
    const res = await pool.query("SELECT a.status, a.application_id, c.full_name FROM applications a JOIN candidates c ON a.candidate_id = c.candidate_id WHERE c.full_name ILIKE '%Rahul%'");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkStatus();
