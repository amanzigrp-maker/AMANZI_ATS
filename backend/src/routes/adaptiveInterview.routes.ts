import { Router } from 'express';
import { startInterview, submitAnswer, getReport } from '../controllers/adaptiveInterview.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   POST /api/interview/adaptive/start
 * @desc    Initialize an adaptive interview session
 */
router.post('/start', verifyToken, startInterview);

/**
 * @route   POST /api/interview/adaptive/submit
 * @desc    Submit an answer and get the next adaptive question
 */
router.post('/submit', verifyToken, submitAnswer);

/**
 * @route   GET /api/interview/adaptive/report
 * @desc    Get skill-wise IRT proficiency report
 */
router.get('/report', verifyToken, getReport);

export default router;
