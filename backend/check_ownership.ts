import { pool } from './src/lib/database';

async function checkOwnership() {
  try {
    const res = await pool.query(`
      SELECT 
        a.application_id, 
        a.uploaded_by_user_id, 
        a.vendor_id, 
        r.uploaded_by AS resume_uploaded_by,
        c.full_name
      FROM applications a 
      JOIN candidates c ON a.candidate_id = c.candidate_id 
      LEFT JOIN resumes r ON r.candidate_id = c.candidate_id
      WHERE c.full_name ILIKE '%Rahul%'
    `);
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkOwnership();
