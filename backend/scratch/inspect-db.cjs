const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/amanzi_ats'
});

async function main() {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables:', res.rows.map(r => r.table_name));

    // Check if resumes table exists and its columns
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'resumes'");
    console.log('Resumes columns:', columns.rows.map(r => r.column_name));

    // Check if session_id is missing in any heartbeat or worker tables
    const tables = res.rows.map(r => r.table_name);
    for (const table of tables) {
      if (table.includes('worker') || table.includes('heartbeat')) {
        const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
        console.log(`${table} columns:`, cols.rows.map(r => r.column_name));
      }
    }

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
    process.exit(0);
  }
}
main();
