// Quick script to check database tables and data
// Run with: node scripts/check-database.js

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function checkDatabase() {
  try {
    console.log('\n🔍 Checking database connection...\n');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully!\n');
    
    // Check tables
    console.log('📊 Tables in database:');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('❌ No tables found! You need to create your database tables.\n');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
      console.log('');
    }
    
    // Check users
    console.log('👥 Users in database:');
    const usersResult = await pool.query('SELECT userid, email, role, status, createdat FROM users ORDER BY userid');
    
    if (usersResult.rows.length === 0) {
      console.log('❌ No users found! Create a user to get started.\n');
    } else {
      console.table(usersResult.rows);
    }
    
    // Check recent logins
    console.log('🔐 Recent login attempts (last 5):');
    const loginsResult = await pool.query(`
      SELECT l.auditid, u.email, l.loginstatus, l.logintime, l.ipaddress
      FROM loginaudit l
      LEFT JOIN users u ON l.userid = u.userid
      ORDER BY l.logintime DESC
      LIMIT 5
    `);
    
    if (loginsResult.rows.length === 0) {
      console.log('No login attempts yet.\n');
    } else {
      console.table(loginsResult.rows);
    }
    
    // Check refresh tokens
    console.log('🎫 Active refresh tokens:');
    const tokensResult = await pool.query(`
      SELECT u.email, rt.created_at, rt.expiry
      FROM refresh_tokens rt
      JOIN users u ON rt.user_id = u.userid
      WHERE rt.expiry > NOW()
      ORDER BY rt.created_at DESC
      LIMIT 5
    `);
    
    if (tokensResult.rows.length === 0) {
      console.log('No active tokens.\n');
    } else {
      console.table(tokensResult.rows);
    }
    
    console.log('✅ Database check complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('does not exist')) {
      console.log('\n💡 Tip: Run your database migrations to create the tables.');
      console.log('   Check DATABASE_SETUP.md for instructions.\n');
    }
  } finally {
    await pool.end();
  }
}

checkDatabase();
