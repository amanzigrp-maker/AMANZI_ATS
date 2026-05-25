import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { pool } from "../../lib/database";

const BASE_SHELF_PATH = path.join(process.cwd(), "storage", "question-bank");

// simple local lock manager to prevent race conditions during concurrent writes to the same questions.json file
class LockManager {
  private static locks: Record<string, Promise<void>> = {};

  public static async acquire(key: string): Promise<() => void> {
    const current = this.locks[key] || Promise.resolve();
    let resolveLock!: () => void;
    this.locks[key] = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    await current;
    return resolveLock;
  }
}

export class QuestionShelfService {
  
  /**
   * Helper to ensure a directory exists
   */
  private static async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Scans a string for matching keywords and resolves to a standard category name.
   */
  private static matchTextToCategory(text: string): string | null {
    const t = text.toLowerCase();

    // Group MERN, MEAN, and Full Stack together into "Mern Stack"
    if (/\b(mern|mean|full\s*stack|fullstack)\b/i.test(t)) {
      return "Mern Stack";
    }
    if (/\bjava\b/i.test(t) && !/\bjavascript\b/i.test(t)) {
      return "Java";
    }
    if (/\bpython\b/i.test(t)) {
      return "Python";
    }
    if (/\b(javascript|js|typescript|ts)\b/i.test(t)) {
      return "JavaScript";
    }
    if (/\b(react|reactjs)\b/i.test(t)) {
      return "React";
    }
    if (/\b(node|nodejs)\b/i.test(t)) {
      return "NodeJS";
    }
    if (/\b(sql|postgres|mysql|sqlite|database|db)\b/i.test(t)) {
      return "SQL";
    }
    if (/\b(html|css|tailwind|sass|flexbox|grid|styling)\b/i.test(t)) {
      return "CSS";
    }
    if (/\b(docker|kubernetes|k8s|devops|aws|cloud|ci\/cd|pipeline)\b/i.test(t)) {
      return "DevOps/Cloud";
    }
    return null;
  }

  /**
   * Detects category automatically based on topic, assessment title, or question text.
   * Prioritizes overall topic/assessment context over individual question keywords.
   */
  public static determineCategory(questionText: string, topic?: string, assessmentTitle?: string): string {
    // 1. Prioritize overall assessment topic
    if (topic && topic.trim().length > 0) {
      const match = this.matchTextToCategory(topic);
      if (match) return match;
    }

    // 2. Fallback to overall assessment title
    if (assessmentTitle && assessmentTitle.trim().length > 0) {
      const match = this.matchTextToCategory(assessmentTitle);
      if (match) return match;
    }

    // 3. Fallback to scanning individual question text
    if (questionText && questionText.trim().length > 0) {
      const match = this.matchTextToCategory(questionText);
      if (match) return match;
    }

    // 4. Default: Sanitized and Capitalized topic
    if (topic && topic.trim().length > 0) {
      const clean = topic.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
      if (clean) {
        return clean.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }

    // 5. Default: Sanitized and Capitalized title
    if (assessmentTitle && assessmentTitle.trim().length > 0) {
      const clean = assessmentTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
      if (clean) {
        return clean.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }

    return "General";
  }

  /**
   * Normalizes question text for robust deduplication:
   * - converts to lowercase
   * - removes punctuation
   * - strips stop words
   * - collapses whitespace
   */
  public static normalizeQuestion(text: string): string {
    const stopwords = new Set([
      "a", "an", "the", "is", "are", "was", "were", "to", "from", "in", "on", "at",
      "for", "with", "by", "about", "against", "between", "into", "through", "during",
      "before", "after", "above", "below", "up", "down", "of", "off", "over", "under",
      "again", "further", "then", "once", "what", "which", "how", "why", "who", "whom"
    ]);

    return (text || "")
      .toLowerCase()
      .replace(/[^\w\s]/gi, "") // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 0 && !stopwords.has(word))
      .join(" ")
      .trim();
  }

  /**
   * Generates a SHA-256 hash of normalized question text
   */
  public static generateQuestionHash(text: string): string {
    const normalized = this.normalizeQuestion(text);
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Saves a single question into the appropriate shelf folder and synchronizes with PostgreSQL database.
   * Performs deduplication check on both filesystem and PostgreSQL.
   */
  public static async saveQuestionToShelf(
    question: {
      question_text: string;
      options: Record<string, string> | any[];
      correct_option: string;
      difficulty?: string;
      topic?: string;
      explanation?: string;
    },
    topic?: string,
    assessmentTitle?: string
  ): Promise<boolean> {
    const category = this.determineCategory(question.question_text, topic, assessmentTitle);
    
    // Path traversal prevention: sanitize category name for filesystem safety
    const sanitizedCategory = category.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    const finalCategory = sanitizedCategory || "General";

    const hash = this.generateQuestionHash(question.question_text);
    const categoryDirPath = path.join(BASE_SHELF_PATH, finalCategory);
    const filePath = path.join(categoryDirPath, "questions.json");

    // Acquire lock for this category to prevent concurrent write race conditions
    const release = await LockManager.acquire(finalCategory);

    try {
      // 1. Filesystem check
      await this.ensureDir(categoryDirPath);
      let shelfQuestions: any[] = [];
      try {
        const content = await fs.readFile(filePath, "utf8");
        shelfQuestions = JSON.parse(content);
      } catch {
        shelfQuestions = [];
      }

      const fileDuplicate = shelfQuestions.some((q: any) => q.hash === hash);

      // 2. Database check
      let dbDuplicate = false;
      try {
        const dbResult = await pool.query(
          "SELECT id FROM question_bank WHERE normalized_hash = $1 LIMIT 1",
          [hash]
        );
        dbDuplicate = dbResult.rows.length > 0;
      } catch (dbErr) {
        console.error("⚠️ Database duplicate check failed:", dbErr);
      }

      if (fileDuplicate || dbDuplicate) {
        console.warn(`[DUPLICATE SKIPPED] Question already exists in shelf "${finalCategory}" (Hash: ${hash})`);
        return false;
      }

      // Parse options to key-value objects if it is a Record
      let formattedOptions: any[] = [];
      if (question.options) {
        if (typeof question.options === "object" && !Array.isArray(question.options)) {
          formattedOptions = Object.entries(question.options).map(([key, text]) => ({
            key: String(key).toUpperCase(),
            text: String(text).trim()
          }));
        } else if (Array.isArray(question.options)) {
          formattedOptions = question.options.map((opt: any, idx: number) => {
            if (typeof opt === "object" && opt !== null && "key" in opt) {
              return opt;
            }
            return {
              key: String.fromCharCode(65 + idx),
              text: String(opt).trim()
            };
          });
        }
      }

      // 3. Write to Filesystem
      const newQuestionId = crypto.randomUUID();
      const newQuestion = {
        id: newQuestionId,
        question: question.question_text,
        options: formattedOptions,
        correctAnswer: question.correct_option,
        difficulty: question.difficulty || "medium",
        tags: question.topic ? [question.topic] : [finalCategory],
        hash: hash,
        createdAt: new Date().toISOString()
      };

      shelfQuestions.push(newQuestion);
      await fs.writeFile(filePath, JSON.stringify(shelfQuestions, null, 2), "utf8");
      console.log(`[QUESTION SAVED] Saved unique question to shelf "${finalCategory}" (ID: ${newQuestionId})`);

      // 4. Synchronize to PostgreSQL
      const dbClient = await pool.connect();
      try {
        await dbClient.query("BEGIN");
        await dbClient.query(`
          INSERT INTO question_bank (
            category, question_text, normalized_hash, options, correct_answer, difficulty, tags
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (normalized_hash) DO NOTHING
        `, [
          finalCategory,
          question.question_text,
          hash,
          JSON.stringify(formattedOptions),
          question.correct_option,
          question.difficulty || "medium",
          question.topic ? [question.topic] : [finalCategory]
        ]);
        await dbClient.query("COMMIT");
        console.log(`[DB SYNCED] Successfully synchronized question bank DB for hash "${hash}"`);
      } catch (dbErr) {
        await dbClient.query("ROLLBACK").catch(() => {});
        console.error("❌ PostgreSQL shelf sync failed:", dbErr);
      } finally {
        dbClient.release();
      }

      return true;
    } catch (err) {
      console.error(`❌ Error saving question to shelf "${finalCategory}":`, err);
      throw err;
    } finally {
      release(); // Always release the lock
    }
  }

  /**
   * Lists all shelves (folders) along with counts and last-updated times
   */
  public static async getShelves(): Promise<{ category: string; count: number; lastUpdated: string }[]> {
    await this.ensureDir(BASE_SHELF_PATH);
    try {
      const dirs = await fs.readdir(BASE_SHELF_PATH, { withFileTypes: true });
      const shelves = [];

      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const category = dir.name;
          const filePath = path.join(BASE_SHELF_PATH, category, "questions.json");
          let count = 0;
          let lastUpdated = new Date().toISOString();

          try {
            const stats = await fs.stat(filePath);
            lastUpdated = stats.mtime.toISOString();

            const content = await fs.readFile(filePath, "utf8");
            const questions = JSON.parse(content);
            count = Array.isArray(questions) ? questions.length : 0;
          } catch {
            count = 0;
          }

          shelves.push({
            category,
            count,
            lastUpdated
          });
        }
      }

      // Sort by category name
      return shelves.sort((a, b) => a.category.localeCompare(b.category));
    } catch (err) {
      console.error("❌ Failed to list shelves from disk:", err);
      return [];
    }
  }

  /**
   * Retrieves all questions stored in a shelf file
   */
  public static async getShelfQuestions(category: string): Promise<any[]> {
    const sanitizedCategory = category.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    const finalCategory = sanitizedCategory || "General";
    const filePath = path.join(BASE_SHELF_PATH, finalCategory, "questions.json");

    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Deletes a question from the filesystem shelf and PostgreSQL
   */
  public static async deleteQuestion(category: string, hash: string): Promise<boolean> {
    const sanitizedCategory = category.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    const finalCategory = sanitizedCategory || "General";
    const categoryDirPath = path.join(BASE_SHELF_PATH, finalCategory);
    const filePath = path.join(categoryDirPath, "questions.json");

    const release = await LockManager.acquire(finalCategory);

    try {
      // 1. Filesystem update
      let questions: any[] = [];
      try {
        const content = await fs.readFile(filePath, "utf8");
        questions = JSON.parse(content);
      } catch {
        return false;
      }

      const initialLength = questions.length;
      questions = questions.filter((q: any) => q.hash !== hash);

      if (questions.length === initialLength) {
        return false;
      }

      if (questions.length === 0) {
        // Delete folder if empty
        await fs.rm(filePath, { force: true });
        await fs.rm(categoryDirPath, { recursive: true, force: true }).catch(() => {});
        console.log(`[SHELF DELETED] Removed empty shelf folder for "${finalCategory}"`);
      } else {
        await fs.writeFile(filePath, JSON.stringify(questions, null, 2), "utf8");
      }

      console.log(`[QUESTION DELETED] Deleted question from shelf "${finalCategory}" (Hash: ${hash})`);

      // 2. Database update
      try {
        await pool.query("DELETE FROM question_bank WHERE normalized_hash = $1", [hash]);
        console.log(`[DB SYNCED] Removed question from question_bank table (Hash: ${hash})`);
      } catch (dbErr) {
        console.error("❌ Failed to delete from database question_bank:", dbErr);
      }

      return true;
    } catch (err) {
      console.error(`❌ Error deleting question from shelf "${finalCategory}":`, err);
      throw err;
    } finally {
      release();
    }
  }

  /**
   * Deletes the entire shelf folder and all its associated questions from database
   */
  public static async deleteShelf(category: string): Promise<boolean> {
    const sanitizedCategory = category.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    const finalCategory = sanitizedCategory || "General";
    const categoryDirPath = path.join(BASE_SHELF_PATH, finalCategory);

    const release = await LockManager.acquire(finalCategory);

    try {
      // 1. Filesystem update: delete category folder recursively
      let folderDeleted = false;
      try {
        await fs.rm(categoryDirPath, { recursive: true, force: true });
        folderDeleted = true;
        console.log(`[SHELF DELETED] Removed folder recursively for "${finalCategory}"`);
      } catch (err) {
        console.warn(`[SHELF DELETE WARNING] Folder not found or couldn't be deleted for "${finalCategory}":`, err);
      }

      // 2. Database update: delete all questions matching category
      let rowsDeleted = 0;
      try {
        const dbResult = await pool.query("DELETE FROM question_bank WHERE category = $1", [finalCategory]);
        rowsDeleted = dbResult.rowCount || 0;
        console.log(`[DB SYNCED] Removed ${rowsDeleted} questions from question_bank table matching category "${finalCategory}"`);
      } catch (dbErr) {
        console.error("❌ Failed to delete category from database question_bank:", dbErr);
      }

      return folderDeleted || rowsDeleted > 0;
    } catch (err) {
      console.error(`❌ Error deleting shelf "${finalCategory}":`, err);
      throw err;
    } finally {
      release();
    }
  }
}
