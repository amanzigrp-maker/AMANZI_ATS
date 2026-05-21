import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { app, safeStorage } from "electron";

type CachedAnswer = {
  sessionId: string;
  questionId: string | number;
  answer: unknown;
  savedAt: string;
};

export class OfflineAnswerCacheService {
  private readonly cachePath = path.join(
    app.getPath("userData"),
    "offline-answer-cache.bin"
  );

  async save(answer: CachedAnswer) {
    const existing = await this.readAll();

    const next = [
      ...existing.filter((item) => item.questionId !== answer.questionId),
      answer,
    ];

    const plaintext = Buffer.from(JSON.stringify(next));

    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(plaintext.toString("utf8"))
      : crypto.publicEncrypt(this.fallbackPublicKey(), plaintext);

    await fs.writeFile(this.cachePath, encrypted);
  }

  async readAll(): Promise<CachedAnswer[]> {
    try {
      const encrypted = await fs.readFile(this.cachePath);

      const plaintext = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(encrypted)
        : "[]";

      return JSON.parse(plaintext);
    } catch {
      return [];
    }
  }

  async clear() {
    await fs.rm(this.cachePath, { force: true });
  }

  private fallbackPublicKey(): string {
    const key = process.env.OFFLINE_CACHE_PUBLIC_KEY;

    if (!key) {
      throw new Error(
        "Offline cache requires OS safeStorage or OFFLINE_CACHE_PUBLIC_KEY."
      );
    }

    return key;
  }
}