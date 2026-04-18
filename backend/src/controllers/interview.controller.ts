import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../lib/database';
import { sendInterviewLink, sendInterviewCredentials } from '../services/email.service';
import { generateAdaptiveSequence } from '../services/ai-interview.service';
import { InterviewRequest } from '../middleware/interview-auth.middleware';

/**
 * Search candidates by email or name (partial matching)
 */
export const searchCandidates = async (req: Request, res: Response) => {
  try {
    const { query, email } = req.query;
    const searchTerm = (query || email) as string;

    if (!searchTerm) {
      return res.status(400).json({ success: false, error: 'Search term is required' });
    }

    const result = await pool.query(
      `SELECT c.candidate_id, c.full_name, c.email,
              json_agg(json_build_object('id', j.job_id, 'title', j.title)) FILTER (WHERE j.job_id IS NOT NULL) as applied_jobs
       FROM candidates c
       LEFT JOIN applications a ON c.candidate_id = a.candidate_id
       LEFT JOIN jobs j ON a.job_id = j.job_id
       WHERE c.email ILIKE $1 OR c.full_name ILIKE $1
       GROUP BY c.candidate_id
       ORDER BY 
         CASE 
           WHEN c.email = $2 THEN 1
           WHEN c.email ILIKE $3 THEN 2
           WHEN c.full_name ILIKE $3 THEN 3
           ELSE 4
         END
       LIMIT 10`,
      [`%${searchTerm}%`, searchTerm, `${searchTerm}%`]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Search candidates error:', error);
    res.status(500).json({ success: false, error: 'Failed to search candidates' });
  }
};

/**
 * Generate and send interview link
 */
export const generateAndSendLink = async (req: Request, res: Response) => {
  try {
    const { email, jobRole, validityMins, questionCount } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const duration = validityMins || 5;

    // 1. Validate candidate exists (case-insensitive)
    const candidateResult = await pool.query(
      'SELECT candidate_id, full_name, email FROM candidates WHERE email ILIKE $1',
      [email]
    );

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Candidate not found' });
    }

    const candidate = candidateResult.rows[0];

    // 2. Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins to OPEN the link

    // 3. Robust Schema Update & Save in DB
    try {
      // Check if column exists first to be safe
      const checkColumn = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='interview_tokens' AND column_name='total_questions';
      `);
      
      if (checkColumn.rows.length === 0) {
        console.log('👷 Adding missing total_questions column...');
        await pool.query('ALTER TABLE interview_tokens ADD COLUMN total_questions INTEGER DEFAULT 10;');
      }
    } catch (e) {
      console.error('⚠️ Schema update warning (may already exist):', e.message);
    }

    try {
      await pool.query(
        `INSERT INTO interview_tokens 
         (token, candidate_email, candidate_name, job_role, duration_mins, total_questions, expires_at, is_used, device_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [token, candidate.email, candidate.full_name, jobRole || null, duration, questionCount || 10, expiresAt, false, null]
      );
    } catch (dbError) {
      console.error('❌ Database Insert Failed:', dbError.message);
      // Fallback: If total_questions failed, try inserting WITHOUT it to at least send the link
      try {
        await pool.query(
          `INSERT INTO interview_tokens 
           (token, candidate_email, candidate_name, job_role, duration_mins, expires_at, is_used, device_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [token, candidate.email, candidate.full_name, jobRole || null, duration, expiresAt, false, null]
        );
      } catch (fallbackError) {
        return res.status(500).json({ success: false, error: 'Database could not be updated' });
      }
    }

    // 4. Generate link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const interviewLink = `${frontendUrl}/interview?token=${token}`;

    // 5. Send email
    try {
      await sendInterviewLink(candidate.email, candidate.full_name, interviewLink);
    } catch (mailError) {
      console.error('❌ Email Sending Failed:', mailError);
      // We still return true if DB is saved, or handle based on preference. 
      // Usually, if email fails, the process is considered failed.
      return res.status(500).json({ success: false, error: 'Failed to send email notification' });
    }

    res.json({ success: true, message: 'Interview link sent successfully' });
  } catch (error) {
    console.error('❌ Generate and send link overall error:', error);
    res.status(500).json({ success: false, error: 'Internal system error' });
  }
};

/**
 * Validate interview link
 */
export const validateLink = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required', code: 'INVALID' });
    }

    // 1. Find token and check session status
    const result = await pool.query(
      `SELECT t.*, s.id as session_id, s.is_submitted 
       FROM interview_tokens t
       LEFT JOIN interview_sessions s ON t.token = s.token
       WHERE t.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Link is invalid', code: 'INVALID' });
    }

    const tokenData = result.rows[0];

    // 2. Already submitted?
    if (tokenData.is_submitted) {
      return res.status(400).json({ success: false, error: 'Interview already submitted', code: 'SUBMITTED' });
    }

    // 3. Check if expired (if not already started)
    if (!tokenData.session_id && new Date() > new Date(tokenData.expires_at)) {
      return res.status(400).json({ success: false, error: 'Link has expired', code: 'EXPIRED' });
    }

    // 4. Device locking
    const deviceId = `${req.ip}-${req.headers['user-agent']}`;

    if (!tokenData.device_id) {
      await pool.query(
        'UPDATE interview_tokens SET device_id = $1 WHERE token = $2',
        [deviceId, token]
      );
    } else if (tokenData.device_id !== deviceId) {
      return res.status(403).json({
        success: false,
        error: 'Security alert: Access restricted to original device.',
        code: 'DEVICE_MISMATCH'
      });
    }

    res.json({
      success: true,
      data: {
        email: tokenData.candidate_email,
        name: tokenData.candidate_name,
        role: tokenData.job_role,
        duration: tokenData.duration_mins,
        total_questions: tokenData.total_questions || 10,
        session_id: tokenData.session_id,
        is_started: tokenData.is_used
      }
    });
  } catch (error) {
    console.error('Validate link error:', error);
    res.status(500).json({ success: false, error: 'Failed to validate link' });
  }
};

/**
 * Generate Questions for Interview (Adaptive Sequence Engine)
 */
export const generateQuestions = async (req: Request, res: Response) => {
  try {
    const { token, experience, role } = req.body;

    if (!token || !role) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // 1. Fetch token data for question count
    const tokenResult = await pool.query('SELECT total_questions, candidate_email FROM interview_tokens WHERE token = $1', [token]);
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid session' });
    }
    const tokenData = tokenResult.rows[0];
    const totalQCount = tokenData.total_questions || 10;

    // 2. Check if session already exists
    const sessionCheck = await pool.query(
      'SELECT id FROM interview_sessions WHERE token = $1',
      [token]
    );

    let sessionId;
    if (sessionCheck.rows.length > 0) {
      sessionId = sessionCheck.rows[0].id;
      const questionsCheck = await pool.query('SELECT id FROM interview_questions WHERE session_id = $1', [sessionId]);
      if (questionsCheck.rows.length > 0) {
        return res.json({ success: true, session_id: sessionId });
      }
    } else {
      // Create new session
      const result = await pool.query(
        `INSERT INTO interview_sessions (token, candidate_email, role, experience_years) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [token, tokenData.candidate_email, role, experience || 0]
      );
      sessionId = result.rows[0].id;
      await pool.query('UPDATE interview_tokens SET is_used = true WHERE token = $1', [token]);
    }

    // 3. Generate Sequence via Engine
    const sequenceData = await generateAdaptiveSequence(role, experience || 0, "General", totalQCount);

    if (!sequenceData || !sequenceData.questions || sequenceData.questions.length === 0) {
      return res.status(500).json({ success: false, error: 'AI failed to generate questions' });
    }

    // 4. Save entire sequence to DB
    for (const q of sequenceData.questions) {
      await pool.query(
        `INSERT INTO interview_questions (session_id, question, options, correct_answer) 
         VALUES ($1, $2, $3, $4)`,
        [sessionId, q.question, JSON.stringify(q.options), q.correct_answer]
      );
    }

    await pool.query('UPDATE interview_sessions SET total_questions = $1 WHERE id = $2', [sequenceData.questions.length, sessionId]);

    res.json({ success: true, session_id: sessionId });
  } catch (error) {
    console.error('Generate sequence error:', error);
    res.status(500).json({ success: false, error: 'AI sequence generation failed' });
  }
};

/**
 * Get Questions for Session
 */
export const getQuestions = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ success: false, error: 'Session ID required' });
    }

    const result = await pool.query(
      'SELECT id, question, options FROM interview_questions WHERE session_id = $1 ORDER BY id ASC',
      [session_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch questions' });
  }
};

/**
 * Submit Interview Answers
 */
export const submitAnswers = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { session_id, answers } = req.body;

    if (!session_id || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: 'Invalid submission format' });
    }

    let score = 0;
    for (const ans of answers) {
      const qResult = await client.query(
        'SELECT correct_answer FROM interview_questions WHERE id = $1',
        [ans.question_id]
      );

      const isCorrect = qResult.rows[0]?.correct_answer === ans.selected_answer;
      if (isCorrect) score++;

      await client.query(
        `INSERT INTO interview_responses (session_id, question_id, selected_answer, is_correct) 
         VALUES ($1, $2, $3, $4)`,
        [session_id, ans.question_id, ans.selected_answer, isCorrect]
      );
    }

    await client.query(
      `UPDATE interview_sessions 
       SET is_submitted = true, score = $1, completed_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [score, session_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, score });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit answers error:', error);
    res.status(500).json({ success: false, error: 'Submission failed' });
  } finally {
    client.release();
  }
};

/**
 * Invite candidate with temporary credentials
 */
export const inviteCandidateWithCredentials = async (req: Request, res: Response) => {
  try {
    const { email, name, jobRole, interviewId } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'Email and name are required' });
    }

    // 1. Generate random 10-char alphanumeric password
    const password = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2. Set expiry (2 hours from now)
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // 3. Create or update interview user
    await pool.query(
      `INSERT INTO interview_users (email, password, expires_at, interview_id, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET 
         password = EXCLUDED.password,
         expires_at = EXCLUDED.expires_at,
         interview_id = EXCLUDED.interview_id,
         is_active = TRUE`,
      [email, hashedPassword, expiresAt, interviewId || null, true]
    );

    // 4. Send email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const loginLink = `${frontendUrl}/interview-login`;
    await sendInterviewCredentials(email, name, password, loginLink);

    res.json({ success: true, message: 'Interview credentials sent successfully' });
  } catch (error) {
    console.error('Invite candidate error:', error);
    res.status(500).json({ success: false, error: 'Failed to invite candidate' });
  }
};

/**
 * Start interview session
 */
export const startInterviewSession = async (req: InterviewRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id: interviewUserId, interviewId } = req.interviewUser!;
    const { experience, role } = req.body;

    // 1. Create or get existing session
    let sessionId;
    const sessionCheck = await client.query(
      `SELECT id FROM interview_sessions WHERE interview_user_id = $1 AND status = 'in_progress'`,
      [interviewUserId]
    );

    if (sessionCheck.rows.length > 0) {
      sessionId = sessionCheck.rows[0].id;
    } else {
      const result = await client.query(
        `INSERT INTO interview_sessions (interview_user_id, interview_id, candidate_email, status, role, experience_years)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [interviewUserId, interviewId, req.interviewUser!.email, 'in_progress', role || 'Candidate', experience || 0]
      );
      sessionId = result.rows[0].id;
    }

    // 2. Generate questions if none exist
    const questionsCheck = await client.query('SELECT id FROM interview_questions WHERE session_id = $1', [sessionId]);
    
    if (questionsCheck.rows.length === 0) {
      const sequenceData = await generateAdaptiveSequence(role || 'Software Engineer', experience || 0, "General", 10);
      
      if (!sequenceData || !sequenceData.questions || sequenceData.questions.length === 0) {
        throw new Error("AI failed to generate questions");
      }

      const questions = sequenceData.questions;
      
      for (const q of questions) {
        await client.query(
          `INSERT INTO interview_questions (session_id, question, options, correct_answer) 
           VALUES ($1, $2, $3, $4)`,
          [sessionId, q.question, JSON.stringify(q.options), q.correct_answer]
        );
      }
      
      await client.query('UPDATE interview_sessions SET total_questions = $1 WHERE id = $2', [questions.length, sessionId]);
    }

    await client.query('COMMIT');
    res.json({ success: true, sessionId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Start session error:', error);
    res.status(500).json({ success: false, error: 'Failed to start interview session' });
  } finally {
    client.release();
  }
};

/**
 * Save interview response
 */
export const saveInterviewResponse = async (req: InterviewRequest, res: Response) => {
  try {
    const { sessionId, questionId, selectedAnswer, responseText } = req.body;

    if (!sessionId || !questionId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    await pool.query(
      `INSERT INTO interview_responses (session_id, question_id, selected_answer, response)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, questionId, selectedAnswer || null, responseText || null]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Save response error:', error);
    res.status(500).json({ success: false, error: 'Failed to save response' });
  }
};

/**
 * Finish interview session
 */
export const finishInterviewSession = async (req: InterviewRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { sessionId } = req.body;
    const { id: userId } = req.interviewUser!;

    // 1. Mark session as completed
    await client.query(
      `UPDATE interview_sessions SET status = 'completed', end_time = CURRENT_TIMESTAMP WHERE id = $1`,
      [sessionId]
    );

    // 2. Disable user account
    await client.query(
      `UPDATE interview_users SET is_active = false WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Interview completed and account disabled' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Finish session error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete interview' });
  } finally {
    client.release();
  }
};
