import { pool } from '../src/lib/database';
import bcrypt from 'bcrypt';
async function resetAdminPassword() {
    const email = 'abhinavvats510@gmail.com';
    const newPassword = 'password123';
    const saltRounds = 10;
    try {
        const passwordHash = await bcrypt.hash(newPassword, saltRounds);
        const res = await pool.query("UPDATE users SET passwordhash = $1, status = 'active' WHERE email = $2 RETURNING *", [passwordHash, email]);
        if (res.rowCount > 0) {
            console.log(`✅ Password reset successfully for ${email}`);
            console.log(`New password is: ${newPassword}`);
        }
        else {
            console.error(`❌ User ${email} not found in database.`);
        }
    }
    catch (err) {
        console.error("Error resetting password:", err);
    }
    finally {
        await pool.end();
    }
}
resetAdminPassword();
