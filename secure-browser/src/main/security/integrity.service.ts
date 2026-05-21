import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type IntegrityManifest = Record<string, string>;

export class IntegrityService {
  constructor(private readonly appRoot: string, private readonly manifest: IntegrityManifest) {}

  async validate() {
    const failures: Array<{ file: string; expected: string; actual: string }> = [];

    for (const [relativeFile, expected] of Object.entries(this.manifest)) {
      const filePath = path.join(this.appRoot, relativeFile);
      const buffer = await fs.readFile(filePath);
      const actual = crypto.createHash("sha256").update(buffer).digest("hex");
      if (actual !== expected) failures.push({ file: relativeFile, expected, actual });
    }

    return {
      passed: failures.length === 0,
      failures,
      checkedAt: new Date().toISOString(),
    };
  }
}
