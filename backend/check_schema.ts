import { pool } from './src/lib/database';

async function checkSchema() {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loginaudit'
    `);
    console.log('Columns in loginaudit:');
    console.log(rows);
    process.exit(0);
  } catch (error) {
    console.error('Error checking schema:', error);
    process.exit(1);
  }
}

checkSchema();
