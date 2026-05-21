
import Redis from "ioredis";
import { config } from "../config/env.config";

class RedisService {
  private client: Redis | null = null;
  private isEnabled: boolean = config.REDIS_ENABLED;

  constructor() {
    if (this.isEnabled) {
      this.client = new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        db: config.REDIS_DB,
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
    } else {
      console.warn("⚠️ Redis is disabled. Falling back to in-memory/DB mode.");
    }
  }

  public getClient(): Redis | null {
    return this.client;
  }

  public async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return await this.client.get(key);
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  public async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  /**
   * Distributed Lock Implementation
   */
  public async acquireLock(lockKey: string, ttlMs: number = 5000): Promise<boolean> {
    if (!this.client) return true; // Assume success if Redis is disabled (not recommended for prod)
    const result = await this.client.set(lockKey, "locked", "PX", ttlMs, "NX");
    return result === "OK";
  }

  public async releaseLock(lockKey: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(lockKey);
  }
}

export const redisService = new RedisService();
export default redisService;
