import { pool } from './src/lib/database';

async function simulateGetCandidates() {
  const userId = 19;
  const role = 'recruiter';
  
  const conditions = [];
  const params = [userId];
  const paramIndex = 2;

  conditions.push(`
    EXISTS (
      SELECT 1 FROM resumes r_vis 
      WHERE r_vis.candidate_id = c.candidate_id 
      AND r_vis.uploaded_by = $1
    )
  `);

  let baseQuery = `
    SELECT
      c.*
    FROM candidates c
    LEFT JOIN resumes r ON c.candidate_id = r.candidate_id
  `;

  if (conditions.length > 0) {
    baseQuery += ` WHERE ${conditions.join(' AND ')}`;
  }
  baseQuery += ` GROUP BY c.candidate_id`;

  try {
    const res = await pool.query(baseQuery, params);
    console.log('Candidates for recruiter 19:');
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

simulateGetCandidates();
