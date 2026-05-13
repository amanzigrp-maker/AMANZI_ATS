
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/ABHINAV VATS/Documents/GitHub/New folder/AMANZI_ATS/.env' });

async function checkTables() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'ai_ats_data'
  });

  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    console.log('Tables in ai_ats_data:');
    res.rows.forEach(row => console.log(` - ${row.table_name}`));
  } catch (err) {
    console.error('Error checking tables:', err.message);
  } finally {
    await client.end();
  }
}

checkTables();
