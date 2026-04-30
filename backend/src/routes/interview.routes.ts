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
  getInterviewReport,
  exportInterviewReport,
  updateCandidateDecision,
  getRecentInvites
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

// 5. Fallback for removed feedback feature
router.post('/feedback', verifyToken, (req, res) => {
  res.status(200).json({ message: "Feature removed" });
});


// --- Admin Report Routes ---

// 6. Get interview assessment report (Admin)
router.get('/report', verifyToken, getInterviewReport);
router.get('/report/export', verifyToken, exportInterviewReport);
router.get('/invites', verifyToken, getRecentInvites);

// 7. Update candidate decision (select/reject) (Admin)
router.post('/decision', verifyToken, updateCandidateDecision);

export default router;

