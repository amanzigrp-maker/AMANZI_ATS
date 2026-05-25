"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrityService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
class IntegrityService {
    appRoot;
    manifest;
    constructor(appRoot, manifest) {
        this.appRoot = appRoot;
        this.manifest = manifest;
    }
    async validate() {
        const failures = [];
        for (const [relativeFile, expected] of Object.entries(this.manifest)) {
            const filePath = node_path_1.default.join(this.appRoot, relativeFile);
            const buffer = await promises_1.default.readFile(filePath);
            const actual = node_crypto_1.default.createHash("sha256").update(buffer).digest("hex");
            if (actual !== expected)
                failures.push({ file: relativeFile, expected, actual });
        }
        return {
            passed: failures.length === 0,
            failures,
            checkedAt: new Date().toISOString(),
        };
    }
}
exports.IntegrityService = IntegrityService;
