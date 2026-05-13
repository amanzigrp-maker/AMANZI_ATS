
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/ABHINAV VATS/Documents/GitHub/New folder/AMANZI_ATS/.env' });

console.log('DB_HOST:', process.env.DB_HOST);

async function listDatabases() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres'
  });

  try {
    await client.connect();
    const res = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false;');
    console.log('Databases:');
    res.rows.forEach(row => console.log(` - ${row.datname}`));
  } catch (err) {
    console.error('Error listing databases:', err.message);
  } finally {
    await client.end();
  }
}

listDatabases();
