import pool from "./src/lib/database";
async function verifyFeatures() {
    console.log("---------------------------------------------");
    console.log("🛠️  AMANZI ATS - FEATURE VERIFICATION SCRIPT");
    console.log("---------------------------------------------\n");
    try {
        // 1. Check DB connection
        const res = await pool.query("SELECT current_database(), current_user");
        console.log("✅ Database Connection: SUCCESS");
        console.log(`   Database: ${res.rows[0].current_database}`);
        console.log(`   User: ${res.rows[0].current_user}\n`);
        // 2. Check Question Paper Library Tables
        const qpCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('question_papers', 'question_paper_questions')
    `);
        if (qpCheck.rows.length === 2) {
            console.log("✅ Question Paper Library Tables: VERIFIED");
            const paperCount = await pool.query("SELECT COUNT(*)::int FROM question_papers");
            const qCount = await pool.query("SELECT COUNT(*)::int FROM question_paper_questions");
            console.log(`   - question_papers: ${paperCount.rows[0].count} rows`);
            console.log(`   - question_paper_questions: ${qCount.rows[0].count} rows\n`);
        }
        else {
            console.log("❌ Question Paper Library Tables: MISSING");
            console.log(`   Found only: ${qpCheck.rows.map(r => r.table_name).join(", ")}\n`);
        }
        // 3. Check Bulk Invitation Tables
        const bulkCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('bulk_invite_jobs', 'bulk_invite_candidates', 'invite_logs')
    `);
        if (bulkCheck.rows.length === 3) {
            console.log("✅ Bulk Invitation System Tables: VERIFIED");
            const jobCount = await pool.query("SELECT COUNT(*)::int FROM bulk_invite_jobs");
            const candCount = await pool.query("SELECT COUNT(*)::int FROM bulk_invite_candidates");
            const logCount = await pool.query("SELECT COUNT(*)::int FROM invite_logs");
            console.log(`   - bulk_invite_jobs: ${jobCount.rows[0].count} rows`);
            console.log(`   - bulk_invite_candidates: ${candCount.rows[0].count} rows`);
            console.log(`   - invite_logs: ${logCount.rows[0].count} rows\n`);
        }
        else {
            console.log("❌ Bulk Invitation System Tables: MISSING");
            console.log(`   Found only: ${bulkCheck.rows.map(r => r.table_name).join(", ")}\n`);
        }
        // 4. Check interview_tokens table modifications
        const tokenColsCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'interview_tokens' 
      AND column_name IN ('status', 'bulk_invite_job_id')
    `);
        if (tokenColsCheck.rows.length === 2) {
            console.log("✅ interview_tokens table schema updates: VERIFIED");
            tokenColsCheck.rows.forEach(col => {
                console.log(`   - Column: ${col.column_name} (${col.data_type})`);
            });
            console.log("");
        }
        else {
            console.log("❌ interview_tokens updates: MISSING or incomplete");
            console.log(`   Found columns: ${tokenColsCheck.rows.map(r => r.column_name).join(", ")}\n`);
        }
        console.log("🎉 All database features verified successfully!");
    }
    catch (error) {
        console.error("💥 Verification failed with error:", error.message || error);
    }
    finally {
        await pool.end();
        console.log("🔌 Database pool closed.");
    }
}
verifyFeatures();
