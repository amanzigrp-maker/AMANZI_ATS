import { Router } from 'express';
import { 
  searchCandidates, 
  generateAndSendLink, 
  validateLink, 
  generateQuestions,
  getQuestions,
  submitAnswers,
  inviteCandidateWithCredentials,
  startInterviewSession,
  saveInterviewResponse,
  finishInterviewSession
} from '../controllers/interview.controller';
import { login } from '../controllers/interview-auth.controller';
import { authenticateInterviewUser } from '../middleware/interview-auth.middleware';

const router = Router();

// --- Admin Protected Routes ---
// Candidate search (Admin only)
router.get('/candidates', searchCandidates);

// Generate and send link (Admin only)
router.post('/send-link', generateAndSendLink);

// Invite with credentials (Admin only)
router.post('/invite-credentials', inviteCandidateWithCredentials);


// --- Public/Candidate Routes ---

// 1. Interview Login
router.post('/login', login);

// 2. Token-based flow (Legacy/Alternative)
router.get('/validate', validateLink);
router.post('/generate', generateQuestions);
router.get('/questions', getQuestions);
router.post('/submit', submitAnswers);

// 3. Credential-based flow (Protected)
router.use('/session', authenticateInterviewUser);
router.post('/session/start', startInterviewSession);
router.post('/session/response', saveInterviewResponse);
router.post('/session/finish', finishInterviewSession);

export default router;
