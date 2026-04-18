
import { pool } from './src/lib/database';

async function run() {
  try {
    const res = await pool.query("DELETE FROM notifications WHERE title = 'New Candidate Created'");
    console.log(`✅ Deleted ${res.rowCount} old 'New Candidate Created' notifications.`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

run();
