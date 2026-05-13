import { pool } from '../src/lib/database';
async function checkUsers() {
    try {
        const res = await pool.query("SELECT userid, email, role, status FROM users;");
        console.log("Users in database:");
        console.table(res.rows);
    }
    catch (err) {
        console.error("Error checking users:", err);
    }
    finally {
        await pool.end();
    }
}
checkUsers();
