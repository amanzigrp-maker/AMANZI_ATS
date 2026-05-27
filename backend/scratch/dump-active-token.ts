import { pool } from '../src/lib/database';

async function dump() {
  try {
    const token = '64cf9dd869ca4a4d56b8fecda26d4e4cb43b066e9b7be9ab113acc57f86fea92';
    const res = await pool.query('SELECT * FROM interview_tokens WHERE token = $1', [token]);
    console.log(JSON.stringify(res.rows[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

dump();
