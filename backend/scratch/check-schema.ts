import { pool } from '../src/lib/database';

async function checkSchema() {
  try {
    console.log('Checking job_recommendations schema...');
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'job_recommendations'
    `);
    console.log('job_recommendations:', res.rows);

    console.log('\nChecking job_candidate_matches schema...');
    const res2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'job_candidate_matches'
    `);
    console.log('job_candidate_matches:', res2.rows);

    process.exit(0);
  } catch (err) {
    console.error('Check failed:', err);
    process.exit(1);
  }
}

checkSchema();
