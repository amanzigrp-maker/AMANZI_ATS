"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfflineAnswerCacheService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
class OfflineAnswerCacheService {
    cachePath = node_path_1.default.join(electron_1.app.getPath("userData"), "offline-answer-cache.bin");
    async save(answer) {
        const existing = await this.readAll();
        const next = [
            ...existing.filter((item) => item.questionId !== answer.questionId),
            answer,
        ];
        const plaintext = Buffer.from(JSON.stringify(next));
        const encrypted = electron_1.safeStorage.isEncryptionAvailable()
            ? electron_1.safeStorage.encryptString(plaintext.toString("utf8"))
            : node_crypto_1.default.publicEncrypt(this.fallbackPublicKey(), plaintext);
        await promises_1.default.writeFile(this.cachePath, encrypted);
    }
    async readAll() {
        try {
            const encrypted = await promises_1.default.readFile(this.cachePath);
            const plaintext = electron_1.safeStorage.isEncryptionAvailable()
                ? electron_1.safeStorage.decryptString(encrypted)
                : "[]";
            return JSON.parse(plaintext);
        }
        catch {
            return [];
        }
    }
    async clear() {
        await promises_1.default.rm(this.cachePath, { force: true });
    }
    fallbackPublicKey() {
        const key = process.env.OFFLINE_CACHE_PUBLIC_KEY;
        if (!key) {
            throw new Error("Offline cache requires OS safeStorage or OFFLINE_CACHE_PUBLIC_KEY.");
        }
        return key;
    }
}
exports.OfflineAnswerCacheService = OfflineAnswerCacheService;
