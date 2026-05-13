import pool from '../src/lib/database.js';

async function inspectTable() {
  try {
    const res = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'certificates';
    `);
    console.log('Columns:');
    console.table(res.rows);

    const constraints = await pool.query(`
      SELECT
        tc.constraint_name, 
        tc.constraint_type, 
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'certificates';
    `);
    console.log('Constraints:');
    console.table(constraints.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspectTable();
