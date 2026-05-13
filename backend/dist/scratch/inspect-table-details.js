import { pool } from '../src/lib/database';
async function inspectTableDetails() {
    try {
        const res = await pool.query("SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'loginaudit';");
        console.log("Details for loginaudit:");
        console.table(res.rows);
    }
    catch (err) {
        console.error("Error inspecting table:", err);
    }
    finally {
        await pool.end();
    }
}
inspectTableDetails();
