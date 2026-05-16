import { pool } from "../lib/database";
import crypto from "crypto";
import { geminiService } from "../../services/gemini.service";
export class QuestionBankService {
    /**
     * Pre-processes and inserts a new question with multi-layered duplicate detection
     */
    static async insertQuestion(entry) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // Layer 0: Normalize text (remove stop words, punctuation, etc.)
            const normalizedText = this.normalizeText(entry.textContent);
            const textHash = crypto.createHash("sha256").update(normalizedText).digest("hex");
            // Layer 1: Exact Hash Comparison
            const exactMatch = await client.query("SELECT id FROM question_bank WHERE text_hash = $1 LIMIT 1", [textHash]);
            if (exactMatch.rows.length > 0) {
                await client.query("ROLLBACK");
                return { success: false, reason: "EXACT_DUPLICATE" };
            }
            // Generate Embedding for Layer 3
            const embedding = await geminiService.generateEmbedding(entry.textContent);
            // Layer 3: Semantic Similarity Comparison
            const similarityThresholds = {
                REJECT: 0.95,
                REVIEW: 0.85
            };
            const similarQuestions = await client.query(`
                SELECT q.id, q.text_content, (1 - (e.embedding <=> $1::vector)) as score
                FROM question_bank q
                JOIN question_bank_embeddings e ON q.id = e.question_id
                WHERE q.skill_category = $2
                ORDER BY e.embedding <=> $1::vector
                LIMIT 5
            `, [JSON.stringify(embedding), entry.skillCategory]);
            const topMatch = similarQuestions.rows[0];
            if (topMatch && topMatch.score >= similarityThresholds.REJECT) {
                await client.query("ROLLBACK");
                return { success: false, reason: "SEMANTIC_DUPLICATE", id: topMatch.questionId };
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
            // Insert Embedding
            await client.query(`
                INSERT INTO question_bank_embeddings (question_id, embedding)
                VALUES ($1, $2::vector)
            `, [newQuestionId, JSON.stringify(embedding)]);
            // If it's in the REVIEW range, create a review entry but keep the question (flagged)
            if (topMatch && topMatch.score >= similarityThresholds.REVIEW) {
                const reviewResult = await client.query(`
                    INSERT INTO question_similarity_reviews (source_question_id, target_question_id, similarity_score)
                    VALUES ($1, $2, $3)
                    RETURNING id
                `, [newQuestionId, topMatch.questionId, topMatch.score]);
                await client.query("COMMIT");
                return { success: true, id: newQuestionId, reviewId: reviewResult.rows[0].id, reason: "NEEDS_REVIEW" };
            }
            await client.query("COMMIT");
            return { success: true, id: newQuestionId };
        }
        catch (error) {
            await client.query("ROLLBACK");
            console.error("❌ QuestionBank Insertion Error:", error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Basic NLP normalization
     */
    static normalizeText(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/gi, "") // Remove punctuation
            .split(/\s+/)
            .filter(word => !this.STOP_WORDS.has(word)) // Remove stop words
            .join(" ")
            .trim();
    }
    static STOP_WORDS = new Set([
        "a", "an", "the", "is", "are", "was", "were", "to", "from", "in", "on", "at",
        "for", "with", "by", "about", "against", "between", "into", "through", "during",
        "before", "after", "above", "below", "up", "down", "of", "off", "over", "under",
        "again", "further", "then", "once"
    ]);
    /**
     * Centralized Skill-Based Search
     */
    static async getQuestionsBySkill(skill, difficulty) {
        let query = "SELECT * FROM question_bank WHERE skill_category = $1 AND is_active = TRUE";
        const params = [skill];
        if (difficulty) {
            query += " AND difficulty_level = $2";
            params.push(difficulty);
        }
        const result = await pool.query(query, params);
        return result.rows;
    }
}
