import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "../..");
const appEnvSchema = z.enum(["local", "development", "test", "staging", "production"]);
const normalizeEnv = (value) => {
    const normalized = (value || "local").toLowerCase();
    return normalized === "dev" ? "development" : normalized;
};
const resolvedAppEnv = appEnvSchema.catch("local").parse(normalizeEnv(process.env.APP_ENV || process.env.NODE_ENV));
const loadEnvFile = (filePath, override = false) => {
    dotenv.config({ path: filePath, override });
};
loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, "env", `backend.${resolvedAppEnv}.env`), true);
loadEnvFile(path.join(backendRoot, ".env"), true);
const booleanFromString = z.preprocess((value) => {
    if (typeof value === "boolean")
        return value;
    if (typeof value !== "string")
        return value;
    return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}, z.boolean());
const optionalUrl = z.string().url().optional().or(z.literal("").transform(() => undefined));
const envSchema = z.object({
    APP_ENV: appEnvSchema.default(resolvedAppEnv),
    NODE_ENV: z.enum(["development", "test", "production"]).default(resolvedAppEnv === "production" ? "production" : "development"),
    PORT: z.coerce.number().int().positive().default(3003),
    HOST: z.string().default("0.0.0.0"),
    FRONTEND_URL: z.string().url().default("http://localhost:8080"),
    API_BASE_URL: optionalUrl,
    DB_HOST: z.string().min(1, "DB_HOST is required"),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_NAME: z.string().min(1, "DB_NAME is required"),
    DB_USER: z.string().min(1, "DB_USER is required"),
    DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required"),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters").optional(),
    SECURE_BROWSER_INGEST_TOKEN: z.string().min(32).optional(),
    PYTHON_WORKER_BASE_URL: z.string().url().default("http://127.0.0.1:8001"),
    WORKER_API_HOST: z.string().default("127.0.0.1"),
    WORKER_API_PORT: z.coerce.number().int().positive().default(8001),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
    EMAIL_HOST: z.string().default("smtp.gmail.com"),
    EMAIL_PORT: z.coerce.number().int().positive().default(587),
    EMAIL_USER: z.string().optional(),
    EMAIL_PASSWORD: z.string().optional(),
    EMAIL_SECURE: booleanFromString.default(false),
    EMAIL_FROM_NAME: z.string().default("Amanzi"),
    REDIS_ENABLED: booleanFromString.default(false),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).default(0),
    ELASTICSEARCH_ENABLED: booleanFromString.default(false),
    ELASTICSEARCH_URL: z.string().url().default("http://localhost:9200"),
    ELASTICSEARCH_INDEX_RESUMES: z.string().default("ats_resumes"),
    ELASTICSEARCH_INDEX_JOBS: z.string().default("ats_jobs"),
    ELASTICSEARCH_INDEX_CANDIDATES: z.string().default("ats_candidates"),
    APP_LOG_LEVEL: z.string().default("info"),
    LOG_LEVEL: z.string().default("info"),
    LOG_SENSITIVE_DEV_DETAILS: booleanFromString.default(false),
    SENTRY_DSN: optionalUrl,
    PDFTOTEXT_PATH: z.string().optional(),
    AMANZI_PYTHON_PATH: z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const details = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
    throw new Error(`[CONFIG] Invalid backend environment configuration:\n${details}`);
}
export const config = Object.freeze(parsed.data);
export const isProduction = config.APP_ENV === "production" || config.NODE_ENV === "production";
export const isStaging = config.APP_ENV === "staging";
export const isLocal = config.APP_ENV === "local" || config.APP_ENV === "development";
