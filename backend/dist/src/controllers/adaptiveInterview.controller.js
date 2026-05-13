import { AdaptiveEngineService } from '../services/adaptiveEngine.service';
import { sendInterviewResults } from '../services/email.service';
import { pool } from '../lib/database';
// Use a simple in-memory session store for this demo. 
// In production, use Redis or a sessions table.
const sessionStore = new Map();
export const startInterview = async (req, res) => {
    try {
        const { email, skill, experienceYears } = req.body;
        if (!email || !skill) {
            return res.status(400).json({ error: 'Email and Skill are required' });
        }
        const tokenRes = await pool.query('SELECT total_questions FROM interview_tokens WHERE candidate_email ILIKE $1 ORDER BY created_at DESC LIMIT 1', [email]);
        const maxQuestions = tokenRes.rows.length > 0 ? (tokenRes.rows[0].total_questions || 10) : 10;
        const session = await AdaptiveEngineService.initializeSession(email, skill, experienceYears, maxQuestions);
        const sessionId = `${email}_${skill}_${Date.now()}`;
        sessionStore.set(sessionId, session);
        const firstQuestion = await AdaptiveEngineService.getNextQuestion(session);
        res.json({
            success: true,
            sessionId,
            theta: session.currentTheta,
            question: firstQuestion,
            progress: {
                current: 1,
                total: session.maxQuestions
            }
        });
    }
    catch (error) {
        console.error('Start adaptive interview error:', error);
        res.status(500).json({ error: 'Failed to start interview' });
    }
};
export const submitAnswer = async (req, res) => {
    try {
        const { sessionId, questionId, selectedAnswer } = req.body;
        const session = sessionStore.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }
        // 1. Verify answer (simplified check against DB)
        const qResult = await pool.query('SELECT correct_option, difficulty_b FROM questions WHERE question_id = $1', [questionId]);
        if (qResult.rows.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }
        const isCorrect = qResult.rows[0].correct_option === selectedAnswer;
        // 2. Update IRT Theta
        const { newTheta, isFinished } = await AdaptiveEngineService.submitAnswer(session, questionId, isCorrect);
        if (isFinished) {
            // Send completion email (simplified score calculation for legacy compatibility)
            const proficiency = Math.round((1 / (1 + Math.exp(-1.702 * newTheta))) * 100);
            // Fire and forget email to avoid blocking the response
            sendInterviewResults(session.candidateEmail, session.candidateEmail.split('@')[0], // Fallback name
            proficiency, 100, // Total possible scale
            session.skill, null, // Time taken optional
            {} // Breakdown optional
            ).catch(e => console.error('Failed to send adaptive email:', e));
            sessionStore.delete(sessionId);
            return res.json({
                success: true,
                isFinished: true,
                finalTheta: newTheta,
                proficiency,
                message: 'Interview completed successfully'
            });
        }
        // 3. Get Next Question
        const nextQuestion = await AdaptiveEngineService.getNextQuestion(session);
        res.json({
            success: true,
            isFinished: false,
            newTheta,
            question: nextQuestion,
            progress: {
                current: session.questionCount + 1,
                total: session.maxQuestions
            }
        });
    }
    catch (error) {
        console.error('Submit adaptive answer error:', error);
        res.status(500).json({ error: 'Failed to process answer' });
    }
};
export const getReport = async (req, res) => {
    try {
        const { email } = req.query;
        if (!email)
            return res.status(400).json({ error: 'Email required' });
        const report = await AdaptiveEngineService.getCandidateReport(email);
        res.json({ success: true, report });
    }
    catch (error) {
        console.error('Get report error:', error);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
};
