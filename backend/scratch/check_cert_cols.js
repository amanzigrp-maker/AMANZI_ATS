import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

async function checkSchema() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'ai_ats_data'
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'certificates';
    `);
    console.log('Columns in certificates table:');
    res.rows.forEach(row => console.log(` - ${row.column_name}: ${row.data_type}`));
  } catch (err) {
    console.error('Error checking schema:', err.message);
  } finally {
    await client.end();
  }
}

checkSchema();
