import { pool } from '../src/lib/database';
async function inspectTable() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'loginaudit';");
        console.log("Columns in loginaudit:");
        console.log(res.rows.map(r => r.column_name));
    }
    catch (err) {
        console.error("Error inspecting table:", err);
    }
    finally {
        await pool.end();
    }
}
inspectTable();
