import { Router } from 'express';
import { 
  searchCandidates, 
  generateAndSendLink, 
  validateLink, 
  candidateLogin,
  inviteCredentials,
  saveInterviewVerification,
  confirmInterviewStart,
  submitInterviewFeedback,
  generateQuestions,
  submitAdaptiveAnswer,
  getQuestions,
  submitAnswers,
  processHeartbeat,
  pauseSession,
  getInterviewReport,
  exportInterviewReport,
  updateCandidateDecision,
  getRecentInvites,
  getSessionSuspicionReport,
  downloadSecureBrowser
} from '../controllers/interview.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { rateLimiter } from '../middleware/rate-limiter.middleware';

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

// Download Secure Browser application installer (Public)
router.get('/download-app', downloadSecureBrowser);

// 1.5 Login candidate via temporary credentials (JWT Authentication Flow)
router.post('/login', rateLimiter(15, 60000), candidateLogin);

// 2. Start session & generate questions (Authenticated Candidate)
router.post('/verification', verifyToken, saveInterviewVerification);
router.post('/start-confirmed', verifyToken, confirmInterviewStart);
router.post('/generate', verifyToken, generateQuestions);
router.post('/answer', verifyToken, submitAdaptiveAnswer);
router.post('/heartbeat', verifyToken, rateLimiter(60, 60000), processHeartbeat);
router.post('/pause', verifyToken, pauseSession);

// 3. Get questions (Authenticated Candidate)
router.get('/questions', verifyToken, getQuestions);

// 4. Submit answers (Authenticated Candidate)
router.post('/submit', verifyToken, submitAnswers);

// 5. Fallback for removed feedback feature
router.post('/feedback', verifyToken, submitInterviewFeedback);


// --- Admin Report Routes ---

// 6. Get interview assessment report (Admin)
router.get('/report', verifyToken, getInterviewReport);
router.get('/report/export', verifyToken, exportInterviewReport);
router.get('/report/suspicion', verifyToken, getSessionSuspicionReport);
router.get('/invites', verifyToken, getRecentInvites);

// 7. Update candidate decision (select/reject) (Admin)
router.post('/decision', verifyToken, updateCandidateDecision);

export default router;

