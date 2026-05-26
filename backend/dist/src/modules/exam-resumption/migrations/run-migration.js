import fs from 'fs';
import path from 'path';
import { pool } from '../../../lib/database';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, '016_exam_resumption.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log("🚀 Applying Exam Resumption Migration...");
        await pool.query(sql);
        console.log("✅ Migration applied successfully!");
        process.exit(0);
    }
    catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}
runMigration();
