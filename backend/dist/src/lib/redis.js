import Redis from "ioredis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });
const { REDIS_HOST = "localhost", REDIS_PORT = "6379", REDIS_PASSWORD, REDIS_ENABLED = "false", } = process.env;
class RedisService {
    client = null;
    isEnabled = REDIS_ENABLED === "true";
    constructor() {
        if (this.isEnabled) {
            this.client = new Redis({
                host: REDIS_HOST,
                port: Number(REDIS_PORT),
                password: REDIS_PASSWORD,
                retryStrategy: (times) => {
                    return Math.min(times * 50, 2000);
                },
            });
            this.client.on("error", (err) => {
                console.error("Redis Error:", err);
            });
            this.client.on("connect", () => {
                console.log("✅ Redis Connected");
            });
        }
        else {
            console.warn("⚠️ Redis is disabled. Falling back to in-memory/DB mode.");
        }
    }
    getClient() {
        return this.client;
    }
    async get(key) {
        if (!this.client)
            return null;
        return await this.client.get(key);
    }
    async set(key, value, ttlSeconds) {
        if (!this.client)
            return;
        if (ttlSeconds) {
            await this.client.set(key, value, "EX", ttlSeconds);
        }
        else {
            await this.client.set(key, value);
        }
    }
    async del(key) {
        if (!this.client)
            return;
        await this.client.del(key);
    }
    /**
     * Distributed Lock Implementation
     */
    async acquireLock(lockKey, ttlMs = 5000) {
        if (!this.client)
            return true; // Assume success if Redis is disabled (not recommended for prod)
        const result = await this.client.set(lockKey, "locked", "PX", ttlMs, "NX");
        return result === "OK";
    }
    async releaseLock(lockKey) {
        if (!this.client)
            return;
        await this.client.del(lockKey);
    }
}
export const redisService = new RedisService();
export default redisService;
