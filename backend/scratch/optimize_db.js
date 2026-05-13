import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

async function addIndexes() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'ai_ats_data'
  });

  try {
    await client.connect();
    console.log('Optimizing database for adaptive interview...');
    
    // Index for faster skill/topic lookups
    await client.query(`CREATE INDEX IF NOT EXISTS idx_questions_skill_tag ON questions (skill_tag);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic);`);
    
    // Index for faster option lookups
    await client.query(`CREATE INDEX IF NOT EXISTS idx_question_options_qid ON question_options (question_id);`);
    
    // Index for faster response logging
    await client.query(`CREATE INDEX IF NOT EXISTS idx_irt_responses_email ON irt_responses (candidate_email);`);

    console.log('Database optimization completed.');
  } catch (err) {
    console.error('Optimization failed:', err.message);
  } finally {
    await client.end();
  }
}

addIndexes();
