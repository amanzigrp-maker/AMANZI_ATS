import { pool } from './backend/src/lib/database.js';

async function checkDB() {
  try {
    const qCount = await pool.query('SELECT count(*) FROM questions');
    console.log('Total questions:', qCount.rows[0].count);

    const skills = await pool.query('SELECT skill_tag, count(*) FROM questions GROUP BY skill_tag');
    console.log('Skills and counts:', skills.rows);

    const optionsCount = await pool.query('SELECT count(*) FROM question_options');
    console.log('Total question options:', optionsCount.rows[0].count);

    const sample = await pool.query('SELECT * FROM questions LIMIT 1');
    console.log('Sample question:', sample.rows[0]);

    process.exit(0);
  } catch (err) {
    console.error('Error checking DB:', err);
    process.exit(1);
  }
}

checkDB();
