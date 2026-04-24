import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load ENV from the project root .env (three levels up from src/lib)
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

// Destructure ENV
const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  NODE_ENV,
} = process.env;

// -----------------------------------------------------------------------------
// VALIDATION (NO SILENT FAILURES)
// -----------------------------------------------------------------------------
function validateEnv() {
  const missing = [];

  if (!DB_HOST) missing.push("DB_HOST");
  if (!DB_PORT) missing.push("DB_PORT");
  if (!DB_NAME) missing.push("DB_NAME");
  if (!DB_USER) missing.push("DB_USER");
  if (!DB_PASSWORD) missing.push("DB_PASSWORD");

  if (missing.length > 0) {
    console.error("❌ Missing ENV variables:");
    missing.forEach((key) => console.error(`   - ${key}`));

    console.log("\n📌 Fix:");
    console.log("1. Copy .env.example → .env");
    console.log("2. Fill correct DB values\n");

    process.exit(1); // STOP APP
  }
}

validateEnv();

// -----------------------------------------------------------------------------
// CREATE POOL
// -----------------------------------------------------------------------------
export const pool = new Pool({
  host: DB_HOST,
  port: Number(DB_PORT),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  ssl: NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 3000,
});

// -----------------------------------------------------------------------------
// TEST CONNECTION (FAST + CLEAN)
// -----------------------------------------------------------------------------
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();

    const res = await client.query("SELECT current_database(), inet_server_port()");
    const row = res.rows[0];

    console.log("✅ DB Connected:");
    console.log(`   Database: ${row.current_database}`);
    console.log(`   Port: ${row.inet_server_port}`);

    client.release();
    return true;
  } catch (error: any) {
    console.error("\n❌ DATABASE CONNECTION FAILED\n");

    console.error("Reason:", error.message);

    console.log("\n📌 Check:");
    console.log("1. PostgreSQL is running");
    console.log("2. DB credentials are correct");
    console.log("3. Port is correct (usually 5432)");
    console.log("4. DB exists\n");

    return false;
  }
}

// -----------------------------------------------------------------------------
// GRACEFUL SHUTDOWN
// -----------------------------------------------------------------------------
export async function closePool() {
  await pool.end();
}

export default pool;

