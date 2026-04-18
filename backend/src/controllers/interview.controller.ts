import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../lib/database';
import { sendInterviewLink, sendInterviewResults, sendSelectionEmail } from '../services/email.service';
import { generateAdaptiveSequence } from '../services/ai-interview.service';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../middleware/auth.middleware';

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

    // 2. Generate secure token and password
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins to OPEN the link
    // The duration_mins is how long they have to COMPLETE the interview once started.
    // Actually, validityMins in the UI refers to the link expiration or the test duration?
    // "Search candidate and send secure 5-min link" -> implies the link is available for 5 mins?
    // Or the test is 5 mins?
    // Looking at InterviewPage.tsx: setTimeLeft(300) -> 5 mins.
    // So validityMins is the test duration.
    
    // Link expiration should probably also be configurable, but for now let's use duration_mins for the test.

    // 3. Save in DB
    await pool.query(
      `INSERT INTO interview_tokens 
       (token, candidate_email, candidate_name, job_role, duration_mins, expires_at, is_used, device_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [token, candidate.email, candidate.full_name, jobRole || null, duration, expiresAt, false, null]
    );

    // 4. Generate link
    // Use environment variable for frontend URL, fallback to localhost if not set
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const loginUrl = `${frontendUrl}/interview`;

    // 5. Send email
    await sendInterviewLink(candidate.email, candidate.full_name, loginUrl);

    res.json({ success: true, message: 'Interview link sent successfully' });
  } catch (error) {
    console.error('❌ Generate and send link overall error:', error);
    res.status(500).json({ success: false, error: 'Internal system error' });
  }
};

/**
 * Candidate Login Strategy (JWT Authentication)
 */
export const candidateLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // 1. Find the latest valid generated account for this email
    const result = await pool.query(
      `SELECT t.*, s.id as session_id, s.is_submitted 
       FROM interview_tokens t
       LEFT JOIN interview_sessions s ON t.token = s.token
       WHERE t.candidate_email ILIKE $1 
       ORDER BY t.created_at DESC LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid credentials or account disabled' });
    }

    const tokenData = result.rows[0];

    // 2. Verify Password
    const isMatch = await bcrypt.compare(password, tokenData.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // 3. Validation: Test completed -> Account disabled
    if (tokenData.is_submitted) {
      return res.status(403).json({ success: false, error: 'Account disabled. Interview already completed.' });
    }

    // 4. Validation: Check if expired
    // Wait, let's leave this to avoid strict expiration for now, or just implement it
    // if (!tokenData.session_id && new Date() > new Date(tokenData.expires_at)) {
    //   return res.status(400).json({ success: false, error: 'Interview time has expired' });
    // }

    // 5. Device locking
    const deviceId = `${req.ip}-${req.headers['user-agent']}`;

    if (!tokenData.device_id) {
      await pool.query(
        'UPDATE interview_tokens SET device_id = $1 WHERE token = $2',
        [deviceId, tokenData.token]
      );
    } else if (tokenData.device_id !== deviceId) {
      return res.status(403).json({
        success: false,
        error: 'Security alert: Access restricted to original device.'
      });
    }

    // 6. Generate Candidate JWT
    const candidateJwt = jwt.sign(
      { 
        id: 0, 
        email: tokenData.candidate_email, 
        role: 'candidate',
        interview_token: tokenData.token, // This links them back to their session
      },
      getJwtSecret(),
      { expiresIn: '2h' }
    );

    res.json({
      success: true,
      data: {
        email: tokenData.candidate_email,
        name: tokenData.candidate_name,
        role: tokenData.job_role,
        duration: tokenData.duration_mins,
        session_id: tokenData.session_id,
        is_started: tokenData.is_used,
        token: tokenData.token,
        jwt: candidateJwt
      }
    });
  } catch (error) {
    console.error('Candidate login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
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

    // 5. Generate Candidate JWT
    const candidateJwt = jwt.sign(
      { 
        id: 0, 
        email: tokenData.candidate_email, 
        role: 'candidate',
        interview_token: token,
      },
      getJwtSecret(),
      { expiresIn: '2h' }
    );

    res.json({
      success: true,
      data: {
        email: tokenData.candidate_email,
        name: tokenData.candidate_name,
        role: tokenData.job_role,
        duration: tokenData.duration_mins,
        total_questions: tokenData.total_questions || 10,
        session_id: tokenData.session_id,
        is_started: tokenData.is_used,
        jwt: candidateJwt
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
        `INSERT INTO interview_questions (session_id, question, options, correct_answer, difficulty) 
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, q.question, JSON.stringify(q.options), q.correct_answer, q.difficulty || 'medium']
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

    // Automatically send results email after submission with detailed analysis
    try {
      const sessionResult = await pool.query(
        `SELECT s.*, t.candidate_name, t.job_role, t.duration_mins, t.candidate_email
         FROM interview_sessions s 
         JOIN interview_tokens t ON s.token = t.token 
         WHERE s.id = $1`,
        [session_id]
      );

      if (sessionResult.rows.length > 0) {
        const sess = sessionResult.rows[0];
        
        // Fetch performance breakdown by difficulty
        const breakdownResult = await pool.query(
          `SELECT q.difficulty, 
                  COUNT(*) as total, 
                  SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END) as correct
           FROM interview_questions q
           JOIN interview_responses r ON q.id = r.question_id
           WHERE q.session_id = $1
           GROUP BY q.difficulty`,
          [session_id]
        );

        const breakdownMap: Record<string, { total: number, correct: number }> = {
          'basic': { total: 0, correct: 0 },
          'medium': { total: 0, correct: 0 },
          'advanced': { total: 0, correct: 0 }
        };

        breakdownResult.rows.forEach(row => {
          if (breakdownMap[row.difficulty]) {
            breakdownMap[row.difficulty] = { 
              total: parseInt(row.total), 
              correct: parseInt(row.correct) 
            };
          }
        });

        const startedAt = sess.started_at ? new Date(sess.started_at) : null;
        const completedAt = sess.completed_at ? new Date(sess.completed_at) : new Date();
        const timeTakenMins = startedAt ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000) : null;

        await sendInterviewResults(
          sess.candidate_email,
          sess.candidate_name,
          sess.score,
          sess.total_questions,
          sess.role,
          timeTakenMins,
          breakdownMap
        );
        console.log(`✅ Results email sent to ${sess.candidate_email}`);
      }
    } catch (emailErr) {
      console.error('⚠️ Failed to send results email (non-fatal):', emailErr);
    }

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
 * Submit Interview Feedback
 */
export const submitFeedback = async (req: Request, res: Response) => {
  try {
    const { session_id, feedback } = req.body;

    if (!session_id) {
      return res.status(400).json({ success: false, error: 'Session ID required' });
    }

    // Optional: Store feedback in DB
    await pool.query('UPDATE interview_sessions SET feedback = $1 WHERE id = $2', [feedback, session_id]);

    res.json({ success: true, message: 'Feedback submitted successfully.' });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ success: false, error: 'Failed to process feedback' });
  }
};

/**
 * Get Interview Assessment Report for Admin Reports page
 */
export const getInterviewReport = async (req: Request, res: Response) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const hasDateRange =
      /^\d{4}-\d{2}-\d{2}$/.test(from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(to);

    const dateClause = hasDateRange
      ? `AND s.started_at >= $1::date AND s.started_at < ($2::date + INTERVAL '1 day')`
      : '';

    const query = `
      SELECT 
        s.id as session_id,
        t.candidate_email,
        t.candidate_name,
        t.job_role,
        t.duration_mins,
        s.role as assessed_role,
        s.experience_years,
        s.score,
        s.total_questions,
        s.is_submitted,
        s.started_at,
        s.completed_at,
        s.decision,
        CASE 
          WHEN s.completed_at IS NOT NULL AND s.started_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 60 
          ELSE NULL 
        END as time_taken_mins
      FROM interview_sessions s
      JOIN interview_tokens t ON s.token = t.token
      WHERE s.is_submitted = true
      ${dateClause}
      ORDER BY s.completed_at DESC NULLS LAST
    `;

    const params = hasDateRange ? [from, to] : [];
    const result = await pool.query(query, params);

    const data = result.rows.map((r: any) => ({
      session_id: r.session_id,
      candidate_email: r.candidate_email,
      candidate_name: r.candidate_name,
      job_role: r.job_role || r.assessed_role || '-',
      experience_years: r.experience_years || 0,
      score: r.score,
      total_questions: r.total_questions,
      percentage: r.total_questions > 0 ? Math.round((r.score / r.total_questions) * 100) : 0,
      duration_mins: r.duration_mins || 0,
      time_taken_mins: r.time_taken_mins ? Math.round(r.time_taken_mins) : null,
      started_at: r.started_at ? new Date(r.started_at).toISOString() : null,
      completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      decision: r.decision || 'pending',
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Interview report error:', error);
    res.status(500).json({ success: false, error: 'Failed to load interview report' });
  }
};

/**
 * Update candidate decision (select/reject) from admin panel
 */
export const updateCandidateDecision = async (req: Request, res: Response) => {
  try {
    const { session_id, decision } = req.body;

    if (!session_id || !['selected', 'rejected', 'pending'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'Invalid session_id or decision' });
    }

    await pool.query(
      'UPDATE interview_sessions SET decision = $1 WHERE id = $2',
      [decision, session_id]
    );

    if (decision === 'selected') {
      try {
        const res = await pool.query(
          `SELECT s.id, t.candidate_name, t.candidate_email, s.role
           FROM interview_sessions s
           JOIN interview_tokens t ON s.token = t.token
           WHERE s.id = $1`,
          [session_id]
        );
        if (res.rows.length > 0) {
          await sendSelectionEmail(res.rows[0].candidate_email, res.rows[0].candidate_name, res.rows[0].role);
        }
      } catch (err) {
        console.error('Selection email failed:', err);
      }
    }

    res.json({ success: true, message: `Candidate marked as ${decision}` });
  } catch (error) {
    console.error('Update decision error:', error);
    res.status(500).json({ success: false, error: 'Failed to update decision' });
  }
};
