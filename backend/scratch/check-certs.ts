
import pool from '../src/lib/database.js';

const checkCertificates = async () => {
  try {
    const result = await pool.query('SELECT * FROM certificates ORDER BY issued_at DESC LIMIT 5');
    console.log('--- Recent Certificates ---');
    console.table(result.rows);
  } catch (err) {
    console.error('Error querying certificates:', err);
  } finally {
    await pool.end();
  }
};

checkCertificates();
