import pool from "../lib/database";
export class QuestionPaperService {
    /**
     * Helper to compute difficulty distribution
     */
    static computeDifficultyDistribution(questions) {
        const dist = {};
        for (const q of questions) {
            const diff = q.difficulty || "medium";
            dist[diff] = (dist[diff] || 0) + 1;
        }
        return dist;
    }
    /**
     * Automatically generate reusable question paper snapshot
     */
    static async saveQuestionPaperSnapshot(client, payload) {
        const totalQuestions = payload.questions.length;
        const diffDist = this.computeDifficultyDistribution(payload.questions);
        // Extract unique topics as tags
        const tagsSet = new Set();
        for (const q of payload.questions) {
            if (q.topic)
                tagsSet.add(q.topic);
        }
        const tags = Array.from(tagsSet);
        // Save paper
        const paperRes = await client.query(`
      INSERT INTO question_papers (
        title, description, created_by, assessment_id, total_questions,
        difficulty_distribution, tags, subject, is_template, status, visibility
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 'private')
      RETURNING *
      `, [
            payload.title,
            payload.description || "",
            payload.created_by,
            payload.assessment_id || null,
            totalQuestions,
            JSON.stringify(diffDist),
            tags,
            payload.subject || "General",
            payload.is_template ?? false
        ]);
        const paper = paperRes.rows[0];
        // Save questions
        for (let i = 0; i < payload.questions.length; i++) {
            const q = payload.questions[i];
            await client.query(`
        INSERT INTO question_paper_questions (
          question_paper_id, question_text, difficulty, topic, explanation,
          correct_option, options, difficulty_score, order_index, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
                paper.id,
                q.question_text,
                q.difficulty || "medium",
                q.topic || null,
                q.explanation || null,
                q.correct_option,
                JSON.stringify(q.options),
                q.difficulty_score ?? 0.5,
                i,
                JSON.stringify(q.metadata || {})
            ]);
        }
        return paper;
    }
    /**
     * List papers with pagination, search and filters
     */
    static async getQuestionPapers(userId, userRole, filters) {
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const offset = (page - 1) * limit;
        const conditions = ["status = 'active'"];
        const params = [];
        let paramIndex = 1;
        // RBAC: Recruiters/Leads see papers they created, Admin sees all
        const normalizedRole = userRole.toLowerCase();
        if (normalizedRole !== "admin" && userId) {
            conditions.push(`created_by = $${paramIndex}`);
            params.push(userId);
            paramIndex++;
        }
        if (filters.search) {
            conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
            params.push(`%${filters.search}%`);
            paramIndex++;
        }
        if (filters.subject) {
            conditions.push(`subject = $${paramIndex}`);
            params.push(filters.subject);
            paramIndex++;
        }
        if (filters.difficulty) {
            // e.g. difficulty_distribution has the key
            conditions.push(`difficulty_distribution ? $${paramIndex}`);
            params.push(filters.difficulty);
            paramIndex++;
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const query = `
      SELECT * FROM question_papers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        const countQuery = `
      SELECT COUNT(*)::int FROM question_papers
      ${whereClause}
    `;
        const queryParams = [...params, limit, offset];
        const result = await pool.query(query, queryParams);
        const countParams = [...params];
        const countResult = await pool.query(countQuery, countParams);
        const total = countResult.rows[0]?.count || 0;
        return {
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
    /**
     * Fetch a single question paper by ID along with its questions
     */
    static async getQuestionPaperById(id) {
        const paperResult = await pool.query("SELECT * FROM question_papers WHERE id = $1", [id]);
        if (!paperResult.rows.length)
            return null;
        const questionsResult = await pool.query(`
      SELECT * FROM question_paper_questions
      WHERE question_paper_id = $1
      ORDER BY order_index ASC, id ASC
      `, [id]);
        return {
            ...paperResult.rows[0],
            questions: questionsResult.rows
        };
    }
    /**
     * Duplicate/Clone Question Paper
     */
    static async duplicateQuestionPaper(id, userId) {
        const paperData = await this.getQuestionPaperById(id);
        if (!paperData)
            return null;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const duplicatedPaper = await this.saveQuestionPaperSnapshot(client, {
                title: `${paperData.title} (Copy)`,
                description: paperData.description,
                created_by: userId,
                subject: paperData.subject,
                questions: paperData.questions.map((q) => ({
                    question_text: q.question_text,
                    difficulty: q.difficulty,
                    topic: q.topic,
                    explanation: q.explanation,
                    correct_option: q.correct_option,
                    options: q.options,
                    difficulty_score: q.difficulty_score,
                    metadata: q.metadata
                })),
                is_template: paperData.is_template
            });
            await client.query("COMMIT");
            return duplicatedPaper;
        }
        catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Archive/Delete a paper
     */
    static async archiveQuestionPaper(id) {
        const result = await pool.query(`UPDATE question_papers SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
        return result.rowCount ? result.rows[0] : null;
    }
    /**
     * Patch paper fields
     */
    static async updateQuestionPaper(id, data) {
        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, val] of Object.entries(data)) {
            fields.push(`${key} = $${idx}`);
            values.push(val);
            idx++;
        }
        if (fields.length === 0)
            return null;
        values.push(id);
        const query = `
      UPDATE question_papers 
      SET ${fields.join(", ")}, updated_at = NOW() 
      WHERE id = $${idx} 
      RETURNING *
    `;
        const result = await pool.query(query, values);
        return result.rowCount ? result.rows[0] : null;
    }
    /**
     * Create an Assessment directly from a Saved Question Paper
     */
    static async createAssessmentFromPaper(payload) {
        const paper = await this.getQuestionPaperById(payload.paper_id);
        if (!paper)
            throw new Error("Question paper not found");
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // 1. Insert assessment
            const assessmentRes = await client.query(`
        INSERT INTO assessments (title, description, role, duration_minutes, status, created_by)
        VALUES ($1, $2, $3, $4, 'draft', $5)
        RETURNING *
        `, [
                payload.title || paper.title,
                payload.description || paper.description || "",
                payload.role || paper.subject || "",
                payload.duration_minutes || 30,
                payload.created_by
            ]);
            const assessment = assessmentRes.rows[0];
            // 2. Insert question sets
            const questionSetRes = await client.query(`
        INSERT INTO question_sets (assessment_id, name, source_type, metadata, created_by)
        VALUES ($1, $2, 'upload', $3, $4)
        RETURNING *
        `, [
                assessment.assessment_id,
                "Default section",
                JSON.stringify({ imported_count: paper.questions.length, question_paper_id: paper.id }),
                payload.created_by
            ]);
            const questionSet = questionSetRes.rows[0];
            // 3. Copy questions and options
            for (const q of paper.questions) {
                const insertedQuestion = await client.query(`
          INSERT INTO questions (
            question_set_id, question_text, difficulty, topic, explanation,
            correct_option, review_status, metadata, difficulty_score
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8)
          RETURNING question_id
          `, [
                    questionSet.question_set_id,
                    q.question_text,
                    q.difficulty || "medium",
                    q.topic || null,
                    q.explanation || null,
                    q.correct_option,
                    JSON.stringify(q.metadata || {}),
                    q.difficulty_score ?? 0.5
                ]);
                const questionId = insertedQuestion.rows[0].question_id;
                // Add options
                const opts = typeof q.options === "object" ? q.options : {};
                for (const [key, text] of Object.entries(opts)) {
                    await client.query(`INSERT INTO question_options (question_id, option_key, option_text) VALUES ($1, $2, $3)`, [questionId, key, text]);
                }
            }
            // Update usage count of the paper
            await client.query(`UPDATE question_papers SET usage_count = usage_count + 1 WHERE id = $1`, [payload.paper_id]);
            await client.query("COMMIT");
            return assessment;
        }
        catch (error) {
            await client.query("ROLLBACK").catch(() => { });
            throw error;
        }
        finally {
            client.release();
        }
    }
}
export default QuestionPaperService;
