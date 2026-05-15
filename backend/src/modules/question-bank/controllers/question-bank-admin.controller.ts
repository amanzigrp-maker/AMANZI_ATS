
import { Request, Response } from "express";
import { QuestionBankService } from "../question-bank.service";
import { DifficultyLevel, CognitiveLevel } from "../../../common/types";
import { pool } from "../../../lib/database";

export class QuestionBankAdminController {

    /**
     * Bulk upload/ingest questions into the centralized bank
     */
    public static async ingestQuestions(req: Request, res: Response) {
        try {
            const { questions, skillCategory } = req.body; // Array of question objects

            if (!Array.isArray(questions)) {
                return res.status(400).json({ success: false, error: "Questions must be an array" });
            }

            const results = {
                imported: 0,
                duplicates: 0,
                needsReview: 0,
                errors: 0
            };

            for (const q of questions) {
                try {
                    const entry = {
                        textContent: q.text,
                        skillCategory: skillCategory || q.skill,
                        subtopic: q.subtopic,
                        difficultyLevel: q.difficulty || DifficultyLevel.MEDIUM,
                        experienceLevelYears: q.experience || 0,
                        cognitiveLevel: q.cognitive || CognitiveLevel.APPLY,
                        estimatedTimeSeconds: q.time || 60,
                        metadata: q.metadata || {},
                        textHash: "" // Generated in service
                    };

                    const result = await QuestionBankService.insertQuestion(entry);

                    if (result.success) {
                        if (result.reason === "NEEDS_REVIEW") results.needsReview++;
                        else results.imported++;
                    } else {
                        if (result.reason === "EXACT_DUPLICATE" || result.reason === "SEMANTIC_DUPLICATE") {
                            results.duplicates++;
                        }
                    }
                } catch (err) {
                    console.error("❌ Ingestion error for question:", q.text, err);
                    results.errors++;
                }
            }

            res.json({ success: true, data: results });
        } catch (error) {
            console.error("❌ Bulk Ingestion Error:", error);
            res.status(500).json({ success: false, error: "Failed to ingest questions" });
        }
    }

    /**
     * Get questions pending review (Semantic Similarity Queue)
     */
    public static async getReviewQueue(req: Request, res: Response) {
        try {
            const result = await pool.query(`
                SELECT r.id, r.similarity_score, 
                       q1.text_content as source_text, 
                       q2.text_content as target_text,
                       r.status
                FROM question_similarity_reviews r
                JOIN question_bank q1 ON r.source_question_id = q1.id
                JOIN question_bank q2 ON r.target_question_id = q2.id
                WHERE r.status = 'pending'
                ORDER BY r.similarity_score DESC
            `);

            res.json({ success: true, data: result.rows });
        } catch (error) {
            console.error("❌ Fetch Review Queue Error:", error);
            res.status(500).json({ success: false, error: "Failed to fetch review queue" });
        }
    }

    /**
     * Resolve a similarity review
     */
    public static async resolveReview(req: Request, res: Response) {
        try {
            const { reviewId, action } = req.body; // 'approve' (it's a duplicate) or 'reject' (it's unique)

            if (action === "approve") {
                // If it's a duplicate, we might want to soft-delete the source question
                const reviewRes = await pool.query("SELECT source_question_id FROM question_similarity_reviews WHERE id = $1", [reviewId]);
                const sourceId = reviewRes.rows[0].source_question_id;
                
                await pool.query("UPDATE question_bank SET is_active = FALSE WHERE id = $1", [sourceId]);
                await pool.query("UPDATE question_similarity_reviews SET status = 'approved' WHERE id = $1", [reviewId]);
            } else {
                await pool.query("UPDATE question_similarity_reviews SET status = 'rejected' WHERE id = $1", [reviewId]);
            }

            res.json({ success: true });
        } catch (error) {
            console.error("❌ Resolve Review Error:", error);
            res.status(500).json({ success: false, error: "Failed to resolve review" });
        }
    }
}
