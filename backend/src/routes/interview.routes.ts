import { Router } from 'express';
import { 
  searchCandidates, 
  generateAndSendLink, 
  validateLink, 
  candidateLogin,
  inviteCredentials,
  generateQuestions,
  submitAdaptiveAnswer,
  getQuestions,
  submitAnswers,
  submitFeedback,
  getInterviewReport,
  updateCandidateDecision
} from '../controllers/interview.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

// --- Admin Protected Routes ---
// Candidate search (Admin only)
router.get('/candidates', verifyToken, searchCandidates);

// Generate and send link (Admin only)
router.post('/send-link', verifyToken, generateAndSendLink);
router.post('/invite-credentials', verifyToken, inviteCredentials);

// --- Public / Candidate Interview Routes ---

// 1. Validate link (Public - generates Candidate JWT) - Legacy or alternative option
router.get('/validate', validateLink);

// 1.5 Login candidate via temporary credentials (JWT Authentication Flow)
router.post('/login', candidateLogin);

// 2. Start session & generate questions (Authenticated Candidate)
router.post('/generate', verifyToken, generateQuestions);
router.post('/answer', verifyToken, submitAdaptiveAnswer);

// 3. Get questions (Authenticated Candidate)
router.get('/questions', verifyToken, getQuestions);

// 4. Submit answers (Authenticated Candidate)
router.post('/submit', verifyToken, submitAnswers);

// 5. Submit feedback (Authenticated Candidate)
router.post('/feedback', verifyToken, submitFeedback);

// --- Admin Report Routes ---

// 6. Get interview assessment report (Admin)
router.get('/report', verifyToken, getInterviewReport);

// 7. Update candidate decision (select/reject) (Admin)
router.post('/decision', verifyToken, updateCandidateDecision);

export default router;

