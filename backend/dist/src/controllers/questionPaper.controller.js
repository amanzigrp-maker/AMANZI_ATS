import PDFDocument from "pdfkit";
import { QuestionPaperService } from "../services/question-paper.service";
/**
 * Get userId from authenticated request
 */
const getUserId = (req) => {
    const u = req.user || {};
    return Number(u.userid ?? u.id ?? 0) || null;
};
/**
 * Get userRole from authenticated request
 */
const getUserRole = (req) => {
    return String(req.user?.role || "recruiter").toLowerCase();
};
export const listQuestionPapers = async (req, res) => {
    try {
        const userId = getUserId(req);
        const userRole = getUserRole(req);
        const search = req.query.search ? String(req.query.search) : undefined;
        const subject = req.query.subject ? String(req.query.subject) : undefined;
        const difficulty = req.query.difficulty ? String(req.query.difficulty) : undefined;
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 10;
        const result = await QuestionPaperService.getQuestionPapers(userId, userRole, {
            search,
            subject,
            difficulty,
            page,
            limit
        });
        return res.json({ success: true, ...result });
    }
    catch (error) {
        console.error("❌ listQuestionPapers failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to load question papers" });
    }
};
export const getQuestionPaper = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ success: false, error: "Invalid paper ID" });
        const paper = await QuestionPaperService.getQuestionPaperById(id);
        if (!paper)
            return res.status(404).json({ success: false, error: "Question paper not found" });
        // RBAC: Recruiters/Leads see their own, Admin sees all
        const userId = getUserId(req);
        const userRole = getUserRole(req);
        if (userRole !== "admin" && paper.created_by !== userId) {
            return res.status(403).json({ success: false, error: "Access denied" });
        }
        return res.json({ success: true, data: paper });
    }
    catch (error) {
        console.error("❌ getQuestionPaper failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to load question paper" });
    }
};
export const createQuestionPaper = async (req, res) => {
    try {
        const { title, description, subject, questions, is_template } = req.body;
        if (!title || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ success: false, error: "Title and questions are required" });
        }
        const { pool } = await import("../lib/database");
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const paper = await QuestionPaperService.saveQuestionPaperSnapshot(client, {
                title,
                description,
                created_by: getUserId(req),
                subject,
                questions,
                is_template
            });
            await client.query("COMMIT");
            return res.status(201).json({ success: true, data: paper });
        }
        catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error("❌ createQuestionPaper failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to create question paper" });
    }
};
export const updateQuestionPaper = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ success: false, error: "Invalid paper ID" });
        const paper = await QuestionPaperService.getQuestionPaperById(id);
        if (!paper)
            return res.status(404).json({ success: false, error: "Question paper not found" });
        // RBAC: check ownership
        const userId = getUserId(req);
        const userRole = getUserRole(req);
        if (userRole !== "admin" && paper.created_by !== userId) {
            return res.status(403).json({ success: false, error: "Access denied" });
        }
        const updated = await QuestionPaperService.updateQuestionPaper(id, req.body);
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        console.error("❌ updateQuestionPaper failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to update question paper" });
    }
};
export const duplicateQuestionPaper = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ success: false, error: "Invalid paper ID" });
        const userId = getUserId(req);
        const duplicated = await QuestionPaperService.duplicateQuestionPaper(id, userId);
        if (!duplicated)
            return res.status(404).json({ success: false, error: "Question paper not found" });
        return res.status(201).json({ success: true, data: duplicated });
    }
    catch (error) {
        console.error("❌ duplicateQuestionPaper failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to duplicate question paper" });
    }
};
export const createAssessmentFromQuestionPaper = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ success: false, error: "Invalid paper ID" });
        const { title, description, role, duration_minutes } = req.body;
        const assessment = await QuestionPaperService.createAssessmentFromPaper({
            paper_id: id,
            title,
            description,
            role,
            duration_minutes,
            created_by: getUserId(req)
        });
        return res.status(201).json({ success: true, data: assessment });
    }
    catch (error) {
        console.error("❌ createAssessmentFromQuestionPaper failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to create assessment from paper" });
    }
};
export const archiveQuestionPaper = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ success: false, error: "Invalid paper ID" });
        const paper = await QuestionPaperService.getQuestionPaperById(id);
        if (!paper)
            return res.status(404).json({ success: false, error: "Question paper not found" });
        // RBAC: check ownership
        const userId = getUserId(req);
        const userRole = getUserRole(req);
        if (userRole !== "admin" && paper.created_by !== userId) {
            return res.status(403).json({ success: false, error: "Access denied" });
        }
        await QuestionPaperService.archiveQuestionPaper(id);
        return res.json({ success: true, message: "Question paper archived successfully" });
    }
    catch (error) {
        console.error("❌ archiveQuestionPaper failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to archive question paper" });
    }
};
export const exportQuestionPaperPdf = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ success: false, error: "Invalid paper ID" });
        const paper = await QuestionPaperService.getQuestionPaperById(id);
        if (!paper)
            return res.status(404).json({ success: false, error: "Question paper not found" });
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="Question_Paper_${id}.pdf"`);
        doc.pipe(res);
        // Title Section
        doc.fontSize(22).font("Helvetica-Bold").text(paper.title, { align: "center" });
        doc.moveDown(0.5);
        if (paper.description) {
            doc.fontSize(10).font("Helvetica-Oblique").text(paper.description, { align: "center" });
            doc.moveDown(1);
        }
        doc.fontSize(10).font("Helvetica").text(`Subject/Category: ${paper.subject || "General"}`);
        doc.text(`Total Questions: ${paper.total_questions}`);
        doc.text(`Created At: ${new Date(paper.created_at).toLocaleDateString()}`);
        doc.moveDown(1.5);
        doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor("#cccccc").stroke();
        doc.moveDown(1.5);
        // Questions Section
        let qIndex = 1;
        for (const q of paper.questions) {
            // Check page overflow
            if (doc.y > 650) {
                doc.addPage();
            }
            doc.fontSize(12).font("Helvetica-Bold").text(`${qIndex}. ${q.question_text}`);
            doc.moveDown(0.5);
            const opts = q.options || {};
            for (const [key, text] of Object.entries(opts)) {
                doc.fontSize(10).font("Helvetica").text(`   ${key}) ${text}`);
            }
            doc.moveDown(0.5);
            doc.fontSize(9).font("Helvetica-Oblique").fillColor("#777777")
                .text(`Topic: ${q.topic || "N/A"} | Difficulty: ${q.difficulty}`);
            doc.fillColor("#000000"); // Reset color
            doc.moveDown(1.5);
            qIndex++;
        }
        // Answer Key Page
        doc.addPage();
        doc.fontSize(16).font("Helvetica-Bold").text("Answer Key", { align: "center" });
        doc.moveDown(1);
        qIndex = 1;
        for (const q of paper.questions) {
            doc.fontSize(11).font("Helvetica").text(`Question ${qIndex}: (${q.correct_option})`);
            if (q.explanation) {
                doc.fontSize(9).font("Helvetica-Oblique").fillColor("#555555").text(`Explanation: ${q.explanation}`);
                doc.fillColor("#000000");
            }
            doc.moveDown(0.5);
            qIndex++;
        }
        doc.end();
    }
    catch (error) {
        console.error("❌ exportQuestionPaperPdf failed:", error);
        return res.status(500).json({ success: false, error: error.message || "Failed to export PDF" });
    }
};
