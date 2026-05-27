import { pool } from '../src/lib/database';

async function countQuestions() {
  try {
    const res = await pool.query(
      `SELECT COUNT(*) FROM questions q 
       JOIN question_sets s ON q.question_set_id = s.question_set_id 
       WHERE s.assessment_id = 8`
    );
    console.log('--- QUESTIONS FOR ASSESSMENT 8 ---');
    console.log(JSON.stringify(res.rows, null, 2));

    const totalSets = await pool.query('SELECT * FROM question_sets WHERE assessment_id = 8');
    console.log('--- SETS FOR ASSESSMENT 8 ---');
    console.log(JSON.stringify(totalSets.rows, null, 2));

    const totalQuestions = await pool.query('SELECT COUNT(*) FROM questions');
    console.log('--- TOTAL QUESTIONS IN DB ---');
    console.log(JSON.stringify(totalQuestions.rows, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

countQuestions();
