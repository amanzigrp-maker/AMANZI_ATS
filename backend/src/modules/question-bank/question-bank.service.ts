
import { pool } from "../lib/database";
import crypto from "crypto";
import { geminiService } from "../../services/gemini.service";
import { QuestionBankEntry, DifficultyLevel, CognitiveLevel, EnterpriseError, SimilarityResult } from "../../common/types";

export class QuestionBankService {
    
    /**
     * Pre-processes and inserts a new question with exact duplicate detection only
     * Semantically similar questions are allowed as per requirements
     */
    public static async insertQuestion(entry: QuestionBankEntry): Promise<{ success: boolean; id?: number; reason?: string }> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Layer 0: Normalize text (remove stop words, punctuation, etc.)
            const normalizedText = this.normalizeText(entry.textContent);
            const textHash = crypto.createHash("sha256").update(normalizedText).digest("hex");

            // Layer 1: Exact Hash Comparison - Only reject exact duplicates
            const exactMatch = await client.query(
                "SELECT id FROM question_bank WHERE text_hash = $1 LIMIT 1",
                [textHash]
            );

            if (exactMatch.rows.length > 0) {
                await client.query("ROLLBACK");
                return { success: false, reason: "EXACT_DUPLICATE" };
            }

            // Insert into question_bank
            const insertResult = await client.query(`
                INSERT INTO question_bank (
                    text_content, text_hash, normalized_text, skill_category, subtopic, 
                    difficulty_level, experience_level_years, cognitive_level, 
                    estimated_time_seconds, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `, [
                entry.textContent, textHash, normalizedText, entry.skillCategory, entry.subtopic,
                entry.difficultyLevel, entry.experienceLevelYears, entry.cognitiveLevel,
                entry.estimatedTimeSeconds, JSON.stringify(entry.metadata)
            ]);

            const newQuestionId = insertResult.rows[0].id;

            // Generate and Insert Embedding (for future semantic search capabilities)
            const embedding = await geminiService.generateEmbedding(entry.textContent);
            await client.query(`
                INSERT INTO question_bank_embeddings (question_id, embedding)
                VALUES ($1, $2::vector)
            `, [newQuestionId, JSON.stringify(embedding)]);

            await client.query("COMMIT");
            return { success: true, id: newQuestionId };

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("❌ QuestionBank Insertion Error:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Basic NLP normalization
     */
    private static normalizeText(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/gi, "") // Remove punctuation
            .split(/\s+/)
            .filter(word => !this.STOP_WORDS.has(word)) // Remove stop words
            .join(" ")
            .trim();
    }

    private static STOP_WORDS = new Set([
        "a", "an", "the", "is", "are", "was", "were", "to", "from", "in", "on", "at", 
        "for", "with", "by", "about", "against", "between", "into", "through", "during", 
        "before", "after", "above", "below", "up", "down", "of", "off", "over", "under", 
        "again", "further", "then", "once"
    ]);

    /**
     * Centralized Skill-Based Search
     */
    public static async getQuestionsBySkill(skill: string, difficulty?: DifficultyLevel): Promise<any[]> {
        let query = "SELECT * FROM question_bank WHERE skill_category = $1 AND is_active = TRUE";
        const params: any[] = [skill];

        if (difficulty) {
            query += " AND difficulty_level = $2";
            params.push(difficulty);
        }

        const result = await pool.query(query, params);
        return result.rows;
    }
}
