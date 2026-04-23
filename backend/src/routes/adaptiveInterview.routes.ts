import { Router } from 'express';
import { startInterview, submitAnswer, getReport } from '../controllers/adaptiveInterview.controller';

const router = Router();

/**
 * @route   POST /api/interview/start
 * @desc    Initialize an adaptive interview session
 */
router.post('/start', startInterview);

/**
 * @route   POST /api/interview/submit
 * @desc    Submit an answer and get the next adaptive question
 */
router.post('/submit', submitAnswer);

/**
 * @route   GET /api/interview/report
 * @desc    Get skill-wise IRT proficiency report
 */
router.get('/report', getReport);

export default router;
