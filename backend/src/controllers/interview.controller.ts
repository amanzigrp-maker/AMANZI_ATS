import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../lib/database';
import { sendInterviewLink } from '../services/email.service';
import { generateAIQuestions } from '../services/ai-interview.service';

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
      `SELECT candidate_id, full_name, email 
       FROM candidates 
       WHERE email ILIKE $1 OR full_name ILIKE $1
       ORDER BY 
         CASE 
           WHEN email = $2 THEN 1
           WHEN email ILIKE $3 THEN 2
           WHEN full_name ILIKE $3 THEN 3
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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

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
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes window to start

    // 3. Save in DB
    await pool.query(
      `INSERT INTO interview_tokens 
       (token, candidate_email, candidate_name, expires_at, is_used, device_id) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [token, candidate.email, candidate.full_name, expiresAt, false, null]
    );

    // 4. Generate link
    // Hardcoded to 8080 as environment variables are not resolving correctly
    const frontendUrl = 'http://localhost:8080';
    const interviewLink = `${frontendUrl}/interview?token=${token}`;

    // 5. Send email
    await sendInterviewLink(candidate.email, candidate.full_name, interviewLink);

    res.json({ success: true, message: 'Interview link sent successfully to port 8080' });
  } catch (error) {
    console.error('Generate and send link error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate and send link' });
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
 * Generate Questions for Interview
 */
export const generateQuestions = async (req: Request, res: Response) => {
  try {
    const { token, experience, role } = req.body;

    if (!token || !role) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // 1. Check if session already exists
    const sessionCheck = await pool.query(
      'SELECT id FROM interview_sessions WHERE token = $1',
      [token]
    );

    let sessionId;
    if (sessionCheck.rows.length > 0) {
      sessionId = sessionCheck.rows[0].id;
      // If questions already exist, return session
      const questionsCheck = await pool.query('SELECT id FROM interview_questions WHERE session_id = $1', [sessionId]);
      if (questionsCheck.rows.length > 0) {
        return res.json({ success: true, session_id: sessionId });
      }
    } else {
      // Create new session
      const tokenData = await pool.query('SELECT candidate_email FROM interview_tokens WHERE token = $1', [token]);
      const result = await pool.query(
        `INSERT INTO interview_sessions (token, candidate_email, role, experience_years) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [token, tokenData.rows[0].candidate_email, role, experience || 0]
      );
      sessionId = result.rows[0].id;

      // Mark token as used
      await pool.query('UPDATE interview_tokens SET is_used = true WHERE token = $1', [token]);
    }

    // 2. Generate questions via Gemini
    const questions = await generateAIQuestions(experience || 0, role);

    // 3. Save questions to DB
    for (const q of questions) {
      await pool.query(
        `INSERT INTO interview_questions (session_id, question, options, correct_answer) 
         VALUES ($1, $2, $3, $4)`,
        [sessionId, q.question, JSON.stringify(q.options), q.correct_answer]
      );
    }

    await pool.query('UPDATE interview_sessions SET total_questions = $1 WHERE id = $2', [questions.length, sessionId]);

    res.json({ success: true, session_id: sessionId });
  } catch (error) {
    console.error('Generate questions error:', error);
    res.status(500).json({ success: false, error: 'AI generation failed' });
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
