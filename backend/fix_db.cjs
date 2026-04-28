const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function fixSchema() {
  try {
    console.log('Adding attempted_email column to loginaudit table...');
    await pool.query('ALTER TABLE loginaudit ADD COLUMN IF NOT EXISTS attempted_email VARCHAR(255)');
    console.log('Successfully added attempted_email column.');
    
    // Also check if other columns are missing
    // Based on the INSERT: (userid, ipaddress, deviceinfo, loginstatus, attempted_email)
    
    process.exit(0);
  } catch (error) {
    console.error('Error fixing schema:', error);
    process.exit(1);
  }
}

fixSchema();
