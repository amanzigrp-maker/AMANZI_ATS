import { pool } from './src/lib/database';

async function simulateGetInterviewCandidates() {
  const userId = 19; // amanzirecruiter123@gmail.com
  const role = 'recruiter';
  
  const pipelineStatuses = [
    'profile_share', 'screen_selected', 'interview_l1', 'interview_l2', 'interview_l3',
    'rejected', 'offered', 'backout', 'bg_status', 'joined', 'pending', 'screening',
    'interview', 'interview_scheduled', 'interviewed', 'accepted'
  ];

  const visibilityClause = `
    AND (a.uploaded_by_user_id = $1 OR a.vendor_id = $1)
  `;
  const params = [userId];

  const query = `
    SELECT 
      a.application_id,
      a.status,
      c.full_name
    FROM applications a
    LEFT JOIN candidates c ON a.candidate_id = c.candidate_id
    WHERE a.status = ANY($2)
      ${visibilityClause}
  `;

  try {
    const res = await pool.query(query, [userId, pipelineStatuses]);
    console.log('Results for recruiter 19:');
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

simulateGetInterviewCandidates();
