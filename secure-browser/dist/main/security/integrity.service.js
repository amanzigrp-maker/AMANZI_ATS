import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
export class IntegrityService {
    appRoot;
    manifest;
    constructor(appRoot, manifest) {
        this.appRoot = appRoot;
        this.manifest = manifest;
    }
    async validate() {
        const failures = [];
        for (const [relativeFile, expected] of Object.entries(this.manifest)) {
            const filePath = path.join(this.appRoot, relativeFile);
            const buffer = await fs.readFile(filePath);
            const actual = crypto.createHash("sha256").update(buffer).digest("hex");
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
