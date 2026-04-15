import { Router } from 'express';
import { 
  searchCandidates, 
  generateAndSendLink, 
  validateLink, 
  generateQuestions,
  getQuestions,
  submitAnswers
} from '../controllers/interview.controller';

const router = Router();

// Candidate search (Admin only)
router.get('/candidates', searchCandidates);

// Generate and send link (Admin only)
router.post('/send-link', generateAndSendLink);

// --- Public Interview Routes ---

// 1. Validate link
router.get('/validate', validateLink);

// 2. Start session & generate questions
router.post('/generate', generateQuestions);

// 3. Get questions
router.get('/questions', getQuestions);

// 4. Submit answers
router.post('/submit', submitAnswers);

export default router;
