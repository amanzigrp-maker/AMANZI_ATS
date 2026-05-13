import pg from 'pg';

const config = {
  host: '127.0.0.1',
  port: 5433,
  user: 'postgres',
  password: 'sagar123',
  database: 'ai_ats_data',
};

async function fixConstraint() {
  const client = new pg.Client(config);
  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Check if unique constraint exists
    const res = await client.query(`
      SELECT 1 
      FROM information_schema.table_constraints 
      WHERE table_name = 'certificates' 
      AND constraint_type = 'UNIQUE' 
      AND (constraint_name = 'unique_interview_session_id' OR constraint_name = 'certificates_interview_session_id_key');
    `);

    if (res.rows.length === 0) {
      console.log('Adding unique constraint to interview_session_id...');
      // Note: We use a generic name or check if one already exists under a different name
      await client.query(`
        ALTER TABLE certificates 
        ADD CONSTRAINT unique_interview_session_id UNIQUE (interview_session_id);
      `);
      console.log('Constraint added successfully');
    } else {
      console.log('Unique constraint already exists');
    }

    await client.end();
  } catch (err) {
    console.error('Error fixing constraint:', err);
    process.exit(1);
  }
}

fixConstraint();
