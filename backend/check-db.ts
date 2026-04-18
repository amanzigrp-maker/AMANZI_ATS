
import { pool } from './src/lib/database';

async function check() {
  try {
    const res = await pool.query("SELECT notification_id, title, message, created_at FROM notifications WHERE title = 'New Candidate Created' ORDER BY created_at DESC LIMIT 5");
    console.log("Latest 'New Candidate Created' notifications:");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
