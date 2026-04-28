import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../lib/database';
import { sendInterviewLink, sendInterviewResults, sendSelectionEmail } from '../services/email.service';
import { generateAdaptiveQuestionAtDifficulty } from '../services/ai-interview.service';
import { aiWorkerService } from '../services/ai-worker.service';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../middleware/auth.middleware';

const validateSelectedAssessment = async (req: Request, assessmentId: number | null) => {
  if (!assessmentId) {
    throw new Error('Please choose a question bank before sending.');
  }

  const ownerId = Number((req as any).user?.userid ?? (req as any).user?.id ?? 0) || null;
  const ownerRole = String((req as any).user?.role || '').toLowerCase();
  const params: any[] = [assessmentId];
  let ownerClause = '';

  if (ownerId && ownerRole !== 'admin' && ownerRole !== 'lead') {
    params.push(ownerId);
    ownerClause = `AND a.created_by = $2`;
  }

  const assessmentCheck = await pool.query(
    `
    SELECT a.assessment_id, COUNT(q.question_id)::int AS question_count
    FROM assessments a
    JOIN question_sets qs ON qs.assessment_id = a.assessment_id
    JOIN questions q ON q.question_set_id = qs.question_set_id
    WHERE a.assessment_id = $1
      ${ownerClause}
    GROUP BY a.assessment_id
    `,
    params
  );

  if (!assessmentCheck.rows.length) {
    throw new Error('Selected question bank was not found for this recruiter.');
  }
};

const generateTemporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 5; i += 1) {
    password += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return password;
};

const shuffleRows = <T>(rows: T[]) => {
  const shuffled = [...rows];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const pickBalancedByDifficulty = <T extends { difficulty?: string }>(rows: T[], totalCount: number) => {
  const wanted = Math.max(1, totalCount);
  const byDifficulty = new Map<string, T[]>();

  for (const row of shuffleRows(rows)) {
    const key = String(row.difficulty || 'medium').toLowerCase();
    if (!byDifficulty.has(key)) byDifficulty.set(key, []);
    byDifficulty.get(key)!.push(row);
  }

  const preferredOrder = ['foundation', 'basic', 'developing', 'medium', 'advanced', 'expert'];
  const levels = [
    ...preferredOrder.filter((level) => byDifficulty.has(level)),
    ...Array.from(byDifficulty.keys()).filter((level) => !preferredOrder.includes(level)),
  ];

  const selected: T[] = [];
  while (selected.length < wanted && levels.length) {
    let addedThisRound = false;
    for (const level of levels) {
      const bucket = byDifficulty.get(level);
      const next = bucket?.shift();
      if (next) {
        selected.push(next);
        addedThisRound = true;
        if (selected.length >= wanted) break;
      }
    }
    if (!addedThisRound) break;
  }

  return shuffleRows(selected);
};

const clamp = (value: number, min = 0.05, max = 0.95) => Math.min(max, Math.max(min, value));

const normalizeDifficulty = (difficulty: any) => {
  const raw = String(difficulty || 'medium').toLowerCase();
  if (raw.includes('foundation') || raw.includes('basic') || raw.includes('easy')) return 'basic';
  if (raw.includes('developing') || raw.includes('medium')) return 'medium';
  if (raw.includes('advanced') || raw.includes('expert') || raw.includes('hard')) return 'advanced';
  return 'medium';
};

const difficultyScore = (difficulty: any) => {
  const raw = String(difficulty || 'medium').toLowerCase();
  if (raw.includes('foundation') || raw.includes('basic') || raw.includes('easy')) return 0.3;
  if (raw.includes('developing') || raw.includes('medium')) return 0.5;
  if (raw.includes('advanced')) return 0.72;
  if (raw.includes('expert') || raw.includes('hard')) return 0.88;
  return 0.5;
};

const difficultyForTheta = (theta: number): 'basic' | 'medium' | 'advanced' => {
  if (theta < 0.42) return 'basic';
  if (theta > 0.68) return 'advanced';
  return 'medium';
};

const selectionThetaAfterAnswer = (thetaAfter: number, itemDifficulty: number, isCorrect: boolean) => {
  if (isCorrect) {
    if (itemDifficulty >= 0.68) return Math.max(thetaAfter, 0.78);
    if (itemDifficulty >= 0.42) return Math.max(thetaAfter, 0.72);
    return Math.max(thetaAfter, 0.5);
  }

  if (itemDifficulty <= 0.42) return Math.min(thetaAfter, 0.3);
  if (itemDifficulty <= 0.68) return Math.min(thetaAfter, 0.36);
  return Math.min(thetaAfter, 0.5);
};

const initialThetaFromExperience = (experience: any) => {
  const years = Number(experience);
  if (!Number.isFinite(years) || years < 1) return 0.35;
  if (years < 3) return 0.45;
  if (years < 6) return 0.55;
  return 0.65;
};

const expectedProbability = (theta: number, itemDifficulty: number) => {
  const scale = 8;
  return 1 / (1 + Math.exp(-scale * (theta - itemDifficulty)));
};

const updateThetaElo = (theta: number, itemDifficulty: number, isCorrect: boolean) => {
  const expected = expectedProbability(theta, itemDifficulty);
  const k = 0.12;
  return clamp(theta + k * ((isCorrect ? 1 : 0) - expected));
};

const parseCandidateSkills = (skillsValue: any) => {
  if (Array.isArray(skillsValue)) {
    return skillsValue.map((skill) => String(skill).trim()).filter(Boolean);
  }

  return String(skillsValue || '')
    .replace(/[{}"]/g, '')
    .split(/[,;|]/)
    .map((skill) => skill.trim())
    .filter(Boolean);
};

const getCandidateSkillFocus = async (email: string, sessionId: number, aiQuestionCount: number, role: string) => {
  const result = await pool.query(
    `
    SELECT skills, current_designation, total_experience
    FROM candidates
    WHERE email ILIKE $1
    LIMIT 1
    `,
    [email]
  );

  const row = result.rows[0] || {};
  const skills = Array.from(new Set(parseCandidateSkills(row.skills)));

  if (skills.length > 0) {
    const startOffset = sessionId % skills.length;
    return skills[(startOffset + aiQuestionCount) % skills.length];
  }

  return row.current_designation || role || 'General';
};

const sendCompletionReport = async (sessionId: number) => {
  try {
    const sessionResult = await pool.query(
      `SELECT s.*, t.candidate_name, t.job_role, t.duration_mins, t.candidate_email
       FROM interview_sessions s
       JOIN interview_tokens t ON s.token = t.token
       WHERE s.id = $1`,
      [sessionId]
    );

    if (!sessionResult.rows.length) return;
    const sess = sessionResult.rows[0];

    const breakdownResult = await pool.query(
      `SELECT q.difficulty,
              COUNT(*) as total,
              SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END) as correct
       FROM interview_questions q
       JOIN interview_responses r ON q.id = r.question_id
       WHERE q.session_id = $1
       GROUP BY q.difficulty`,
      [sessionId]
    );

    const breakdownMap: Record<string, { total: number, correct: number }> = {
      foundation: { total: 0, correct: 0 },
      basic: { total: 0, correct: 0 },
      developing: { total: 0, correct: 0 },
      medium: { total: 0, correct: 0 },
      advanced: { total: 0, correct: 0 },
      expert: { total: 0, correct: 0 },
    };

    breakdownResult.rows.forEach((row: any) => {
      const key = String(row.difficulty || 'medium').toLowerCase();
      breakdownMap[key] = {
        total: parseInt(row.total, 10) || 0,
        correct: parseInt(row.correct, 10) || 0,
      };
    });

    const startedAt = sess.started_at ? new Date(sess.started_at) : null;
    const completedAt = sess.completed_at ? new Date(sess.completed_at) : new Date();
    const timeTakenMins = startedAt ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000) : null;

    await sendInterviewResults(
      sess.candidate_email,
      sess.candidate_name,
      Number(sess.score) || 0,
      Number(sess.total_questions) || 0,
      sess.role || sess.job_role,
      timeTakenMins,
      breakdownMap
    );
  } catch (emailErr) {
    console.error('Failed to send completion report email:', emailErr);
  }
};

const formatQuestionForClient = (row: any) => ({
  id: Number(row.id),
  question: String(row.question || ''),
  options: Array.isArray(row.options) ? row.options : Object.values(row.options || {}),
  difficulty: row.difficulty || 'medium',
  theta: row.theta !== undefined ? Number(row.theta) : undefined,
  selection_mode: String(row.selection_mode || ''),
  semantic_similarity: row.semantic_similarity !== undefined && row.semantic_similarity !== null
    ? Number(row.semantic_similarity)
    : undefined,
  semantic_topic: row.semantic_topic ? String(row.semantic_topic) : undefined,
});

const buildSemanticQueryText = ({
  role,
  skillFocus,
  difficulty,
  experience,
  recentQuestions,
}: {
  role: string;
  skillFocus: string;
  difficulty: string;
  experience: number;
  recentQuestions: string[];
}) => {
  const lines = [
    `Role: ${role || 'General'}`,
    `Skill focus: ${skillFocus || role || 'General'}`,
    `Target difficulty: ${difficulty || 'medium'}`,
    `Experience: ${Number(experience) || 0} years`,
  ];

  const recent = recentQuestions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
  if (recent.length) {
    lines.push(`Recent questions already asked: ${recent.join(' | ')}`);
  }

  return lines.join('\n');
};

const scoreSemanticQuestionCandidate = (candidate: any, theta: number) => {
  const semanticSimilarity = Math.max(0, Math.min(1, Number(candidate?.similarity) || 0));
  const difficultyDelta = Math.abs((Number(candidate?.difficulty_score) || difficultyScore(candidate?.difficulty)) - theta);
  const difficultyFit = Math.max(0, 1 - Math.min(difficultyDelta, 1));
  return (semanticSimilarity * 0.72) + (difficultyFit * 0.28);
};

const pickBestSemanticQuestion = (candidates: any[], theta: number) => {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  return [...candidates].sort((a, b) => scoreSemanticQuestionCandidate(b, theta) - scoreSemanticQuestionCandidate(a, theta))[0] || null;
};

const toOptionList = (options: any) => {
  if (Array.isArray(options)) return options.filter(Boolean);
  const optionObject = options && typeof options === 'object' ? options : {};
  return ['A', 'B', 'C', 'D'].map((key) => optionObject[key]).filter(Boolean);
};

const getSemanticAssessmentMatches = async (
  assessmentId: number,
  queryText: string,
  topK: number,
  excludeQuestionIds: number[]
) => {
  let matches = await aiWorkerService.semanticQuestionSearch(assessmentId, queryText, topK, excludeQuestionIds);
  if (matches.length) return matches;

  await aiWorkerService.embedAssessment(assessmentId);
  return aiWorkerService.semanticQuestionSearch(assessmentId, queryText, topK, excludeQuestionIds);
};

const createNextAdaptiveQuestion = async (
  client: any,
  sessionId: number,
  tokenData: any,
  role: string,
  experience: number,
  theta: number
) => {
  const targetDifficulty = difficultyForTheta(theta);
  const generatedCountResult = await client.query(
    `SELECT COUNT(*)::int AS count FROM interview_questions WHERE session_id = $1`,
    [sessionId]
  );
  const generatedCount = Number(generatedCountResult.rows[0]?.count) || 0;
  const aiCountResult = await client.query(
    `SELECT COUNT(*)::int AS count FROM interview_questions WHERE session_id = $1 AND source_question_id IS NULL`,
    [sessionId]
  );
  const aiQuestionCount = Number(aiCountResult.rows[0]?.count) || 0;
  const skillFocus = await getCandidateSkillFocus(tokenData.candidate_email, sessionId, aiQuestionCount, role);
  const shouldUseSkillAi = tokenData.question_source === 'hybrid' && generatedCount % 2 === 1;
  const usedSourceQuestionIdsResult = await client.query(
    `SELECT source_question_id FROM interview_questions WHERE session_id = $1 AND source_question_id IS NOT NULL`,
    [sessionId]
  );
  const recentQuestionsResult = await client.query(
    `SELECT question, source_question_id FROM interview_questions WHERE session_id = $1 ORDER BY id DESC LIMIT 5`,
    [sessionId]
  );
  const recentQuestionTexts = recentQuestionsResult.rows.map((row: any) => String(row.question || '').trim()).filter(Boolean);
  const usedSourceQuestionIds = usedSourceQuestionIdsResult.rows
    .map((row: any) => Number(row.source_question_id))
    .filter((value: number) => Number.isInteger(value) && value > 0);
  const semanticQueryText = buildSemanticQueryText({
    role,
    skillFocus,
    difficulty: targetDifficulty,
    experience,
    recentQuestions: recentQuestionTexts,
  });

  if (!shouldUseSkillAi && (tokenData.question_source === 'bank' || tokenData.question_source === 'hybrid') && tokenData.assessment_id) {
    let selected =
      pickBestSemanticQuestion(
        await getSemanticAssessmentMatches(
          Number(tokenData.assessment_id),
          semanticQueryText,
          10,
          usedSourceQuestionIds
        ),
        theta
      ) as any;

    if (!selected) {
      const candidates = await client.query(
        `
        SELECT
          q.question_id,
          q.question_text,
          q.correct_option,
          q.difficulty,
          q.difficulty_score,
          jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
        FROM question_sets qs
        JOIN questions q ON q.question_set_id = qs.question_set_id
        JOIN question_options o ON o.question_id = q.question_id
        WHERE qs.assessment_id = $1
          AND q.question_id NOT IN (
            SELECT COALESCE(source_question_id, -1)
            FROM interview_questions
            WHERE session_id = $2
          )
        GROUP BY q.question_id
        ORDER BY ABS(COALESCE(q.difficulty_score::float8, $3) - $3), RANDOM()
        LIMIT 25
        `,
        [Number(tokenData.assessment_id), sessionId, theta]
      );

      selected = (shuffleRows(candidates.rows) as any[]).sort((a: any, b: any) => {
        const da = Math.abs((Number(a.difficulty_score) || difficultyScore(a.difficulty)) - theta);
        const db = Math.abs((Number(b.difficulty_score) || difficultyScore(b.difficulty)) - theta);
        return da - db;
      })[0] as any;
    }

    if (!selected && tokenData.question_source === 'bank') return null;
    if (!selected) {
      // Hybrid assessments can continue with role + focused-skill AI if the chosen bank is exhausted.
    } else {
      const optionsObject = selected.options || {};
      const optionList = toOptionList(optionsObject);
      const correctAnswer = optionsObject[selected.correct_option] || selected.correct_option;
      const itemDifficulty = Number(selected.difficulty_score) || difficultyScore(selected.difficulty);

      const inserted = await client.query(
        `
        INSERT INTO interview_questions (session_id, question, options, correct_answer, difficulty, source_question_id, difficulty_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, question, options, difficulty, difficulty_score
        `,
        [sessionId, selected.question_text, JSON.stringify(optionList), correctAnswer, selected.difficulty || targetDifficulty, selected.question_id, itemDifficulty]
      );

      return {
        ...inserted.rows[0],
        theta,
        selection_mode: Number(selected?.similarity) > 0 ? 'semantic+theta' : 'theta-fallback',
        semantic_similarity: Number(selected?.similarity) > 0 ? Number(selected.similarity) : null,
        semantic_topic: String(selected?.topic || skillFocus || '').trim() || null,
      };
    }
  }

  const semanticReferenceQuestions = tokenData.assessment_id
    ? await getSemanticAssessmentMatches(
        Number(tokenData.assessment_id),
        semanticQueryText,
        5,
        usedSourceQuestionIds
      )
    : [];
  const candidateSemanticContext = tokenData.candidate_email
    ? await aiWorkerService.semanticCandidateContext(tokenData.candidate_email, semanticQueryText, 4)
    : [];
  const semanticSimilarityCandidates = [
    ...semanticReferenceQuestions.map((item: any) => Number(item?.similarity) || 0),
    ...candidateSemanticContext.map((item: any) => Number(item?.similarity) || 0),
  ].filter((value: number) => value > 0);
  const bestSemanticSimilarity = semanticSimilarityCandidates.length
    ? Math.max(...semanticSimilarityCandidates)
    : null;

  const aiQuestion = await generateAdaptiveQuestionAtDifficulty(
    role,
    experience || 0,
    skillFocus,
    targetDifficulty,
    {
      relatedTopics: Array.from(
        new Set(
          [skillFocus, ...semanticReferenceQuestions.map((item: any) => String(item?.topic || '').trim())]
            .filter(Boolean)
        )
      ),
      referenceQuestions: semanticReferenceQuestions.map((item: any) => String(item?.question_text || '').trim()).filter(Boolean),
      candidateContext: candidateSemanticContext
        .map((item: any) => {
          const section = String(item?.section || '').trim();
          const content = String(item?.content || '').trim();
          return [section ? `${section}:` : '', content].filter(Boolean).join(' ');
        })
        .filter(Boolean),
    }
  );
  const inserted = await client.query(
    `
    INSERT INTO interview_questions (session_id, question, options, correct_answer, difficulty, difficulty_score)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, question, options, difficulty, difficulty_score
    `,
    [sessionId, aiQuestion.question, JSON.stringify(aiQuestion.options), aiQuestion.correct_answer, targetDifficulty, difficultyScore(targetDifficulty)]
  );

  return {
    ...inserted.rows[0],
    theta,
    selection_mode: bestSemanticSimilarity ? 'semantic-grounded-ai' : 'ai',
    semantic_similarity: bestSemanticSimilarity,
    semantic_topic: skillFocus || role || null,
  };
};

/**
 * Search candidates by email or name (partial matching)
 */
export const searchCandidates = async (req: Request, res: Response) => {
  try {
    const { query, email } = req.query;
    const searchTerm = (query || email) as string;
    const tokens = searchTerm.trim().split(/\s+/).filter(Boolean);

    if (!searchTerm) {
      return res.status(400).json({ success: false, error: 'Search term is required' });
    }

    // Build prefix-compatible tsquery
    const tsQuery = tokens.map(t => `${t.replace(/[^\w]/g, '')}:*`).join(' & ');

    const result = await pool.query(
      `SELECT c.candidate_id, c.full_name, c.email, c.phone, c.location, 
              c.current_designation, c.current_company, c.total_experience as experience, 
              c.skills, c.created_at,
              (
                SELECT coalesce(u.email, 'Unknown') || ' (' || coalesce(u.role, 'member') || ')'
                FROM resumes r 
                JOIN users u ON r.uploaded_by = u.userid 
                WHERE r.candidate_id = c.candidate_id 
                ORDER BY r.created_at DESC LIMIT 1
              ) as uploaded_by,
              json_agg(json_build_object('id', j.job_id, 'title', j.title)) FILTER (WHERE j.job_id IS NOT NULL) as applied_jobs,
              ts_rank_cd(
                to_tsvector('english', coalesce(c.full_name, '') || ' ' || coalesce(c.email, '') || ' ' || coalesce(c.current_designation, '')),
                to_tsquery('english', $1)
              ) as rank
       FROM candidates c
       LEFT JOIN applications a ON c.candidate_id = a.candidate_id
       LEFT JOIN jobs j ON a.job_id = j.job_id
       WHERE 
         c.email ILIKE $2 OR c.full_name ILIKE $2 OR
         to_tsvector('english', coalesce(c.full_name, '') || ' ' || coalesce(c.email, '') || ' ' || coalesce(c.current_designation, '')) @@ to_tsquery('english', $1)
       GROUP BY c.candidate_id
       ORDER BY rank DESC, c.full_name ASC
       LIMIT 10`,
      [tsQuery, `%${searchTerm}%`]
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
    const { email, name, jobRole, validityMins, questionCount, questionSource, assessmentId } = req.body;

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
    const candidateName = String(name || candidate.full_name || '').trim() || candidate.full_name;

    // 2. Generate secure token and password
    const token = crypto.randomBytes(32).toString('hex');
    const plainPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins to OPEN the link
    // The duration_mins is how long they have to COMPLETE the interview once started.
    // Actually, validityMins in the UI refers to the link expiration or the test duration?
    // "Search candidate and send secure 5-min link" -> implies the link is available for 5 mins?
    // Or the test is 5 mins?
    // Looking at InterviewPage.tsx: setTimeLeft(300) -> 5 mins.
    // So validityMins is the test duration.
    
    // Link expiration should probably also be configurable, but for now let's use duration_mins for the test.

    const source = questionSource === 'bank' || questionSource === 'hybrid' ? questionSource : 'ai';
    const selectedAssessmentId = source === 'bank' || source === 'hybrid' ? Number(assessmentId) : null;

    if (source === 'bank' || source === 'hybrid') {
      await validateSelectedAssessment(req, selectedAssessmentId);
    }

    // 3. Save in DB
    await pool.query(
      `INSERT INTO interview_tokens 
       (token, candidate_email, candidate_name, job_role, duration_mins, expires_at, is_used, device_id, password, total_questions, question_source, assessment_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        token,
        candidate.email,
        candidateName,
        jobRole || null,
        duration,
        expiresAt,
        false,
        null,
        hashedPassword,
        Number(questionCount) || 10,
        source,
        selectedAssessmentId,
      ]
    );

    // 4. Generate link
    // Use environment variable for frontend URL, fallback to localhost if not set
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const loginUrl = `${frontendUrl}/interview-login`;

    // 5. Send email
    await sendInterviewLink(candidate.email, candidateName, loginUrl, plainPassword);

    res.json({ success: true, message: 'Interview link sent successfully' });
  } catch (error) {
    console.error('❌ Generate and send link overall error:', error);
    res.status(500).json({ success: false, error: 'Internal system error' });
  }
};

export const inviteCredentials = async (req: Request, res: Response) => {
  try {
    const { email, name, jobRole, validityMins, questionCount, questionSource, assessmentId } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const candidateResult = await pool.query(
      'SELECT candidate_id, full_name, email FROM candidates WHERE email ILIKE $1',
      [email]
    );

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Candidate not found' });
    }

    const candidate = candidateResult.rows[0];
    const candidateName = String(name || candidate.full_name || '').trim() || candidate.full_name;
    const token = crypto.randomBytes(32).toString('hex');
    const plainPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const duration = Number(validityMins) || 15;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const source = questionSource === 'bank' || questionSource === 'hybrid' ? questionSource : 'ai';
    const selectedAssessmentId = source === 'bank' || source === 'hybrid' ? Number(assessmentId) : null;

    if (source === 'bank' || source === 'hybrid') {
      await validateSelectedAssessment(req, selectedAssessmentId);
    }

    await pool.query(
      `INSERT INTO interview_tokens 
       (token, candidate_email, candidate_name, job_role, duration_mins, expires_at, is_used, device_id, password, total_questions, question_source, assessment_id) 
       VALUES ($1, $2, $3, $4, $5, $6, false, null, $7, $8, $9, $10)`,
      [
        token,
        candidate.email,
        candidateName,
        jobRole || null,
        duration,
        expiresAt,
        hashedPassword,
        Number(questionCount) || 10,
        source,
        selectedAssessmentId,
      ]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    await sendInterviewLink(candidate.email, candidateName, `${frontendUrl}/interview`, plainPassword);

    return res.json({ success: true, message: 'Temporary interview credentials sent successfully' });
  } catch (error: any) {
    console.error('Invite credentials error:', error);
    return res.status(400).json({ success: false, error: error.message || 'Failed to send credentials' });
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
        total_questions: tokenData.total_questions || 10,
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
  const client = await pool.connect();
  try {
    const { token, experience, role } = req.body;

    if (!token || !role) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // 1. Fetch token data for question count and question source
    const tokenResult = await client.query(
      'SELECT total_questions, candidate_email, question_source, assessment_id FROM interview_tokens WHERE token = $1',
      [token]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid session' });
    }
    const tokenData = tokenResult.rows[0];
    const totalQCount = tokenData.total_questions || 10;

    // 2. Check if session already exists
    const sessionCheck = await client.query(
      'SELECT id FROM interview_sessions WHERE token = $1',
      [token]
    );

    let sessionId;
    if (sessionCheck.rows.length > 0) {
      sessionId = sessionCheck.rows[0].id;
      const questionsCheck = await client.query('SELECT id, question, options, difficulty, difficulty_score FROM interview_questions WHERE session_id = $1 ORDER BY id ASC LIMIT 1', [sessionId]);
      if (questionsCheck.rows.length > 0) {
        return res.json({
          success: true,
          session_id: sessionId,
          question: formatQuestionForClient(questionsCheck.rows[0]),
        });
      }
    } else {
      const initialTheta = initialThetaFromExperience(experience);
      // Create new session
      const result = await client.query(
        `INSERT INTO interview_sessions (token, candidate_email, role, experience_years, current_theta, target_questions, total_questions) 
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
        [token, tokenData.candidate_email, role, experience || 0, initialTheta, totalQCount]
      );
      sessionId = result.rows[0].id;
      await client.query('UPDATE interview_tokens SET is_used = true WHERE token = $1', [token]);
    }

    const session = await client.query('SELECT current_theta FROM interview_sessions WHERE id = $1', [sessionId]);
    const theta = Number(session.rows[0]?.current_theta) || initialThetaFromExperience(experience);
    const firstQuestion = await createNextAdaptiveQuestion(client, sessionId, tokenData, role, Number(experience) || 0, theta);

    if (!firstQuestion) {
      return res.status(500).json({ success: false, error: 'No matching questions found for this adaptive level' });
    }

    res.json({
      success: true,
      session_id: sessionId,
      question: formatQuestionForClient(firstQuestion),
      theta,
      target_questions: totalQCount,
    });
  } catch (error) {
    console.error('Generate sequence error:', error);
    res.status(500).json({ success: false, error: 'AI sequence generation failed' });
  } finally {
    client.release();
  }
};

export const submitAdaptiveAnswer = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { session_id, question_id, selected_answer } = req.body;
    if (!session_id || !question_id || !selected_answer) {
      return res.status(400).json({ success: false, error: 'session_id, question_id and selected_answer are required' });
    }

    await client.query('BEGIN');

    const sessionResult = await client.query(
      `
      SELECT s.*, t.total_questions, t.question_source, t.assessment_id
      FROM interview_sessions s
      JOIN interview_tokens t ON t.token = s.token
      WHERE s.id = $1
      FOR UPDATE
      `,
      [Number(session_id)]
    );

    if (!sessionResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    const questionResult = await client.query(
      `SELECT id, correct_answer, difficulty_score FROM interview_questions WHERE id = $1 AND session_id = $2`,
      [Number(question_id), Number(session_id)]
    );

    if (!questionResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const question = questionResult.rows[0];
    const thetaBefore = Number(session.current_theta) || 0.5;
    const itemDifficulty = Number(question.difficulty_score) || 0.5;
    const isCorrect = String(question.correct_answer) === String(selected_answer);
    const thetaAfter = updateThetaElo(thetaBefore, itemDifficulty, isCorrect);

    const existingResponse = await client.query(
      `SELECT id FROM interview_responses WHERE session_id = $1 AND question_id = $2 LIMIT 1`,
      [Number(session_id), Number(question_id)]
    );

    if (!existingResponse.rows.length) {
      await client.query(
        `
        INSERT INTO interview_responses (session_id, question_id, selected_answer, is_correct, theta_before, theta_after)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [Number(session_id), Number(question_id), selected_answer, isCorrect, thetaBefore, thetaAfter]
      );
    }

    const answeredCountResult = await client.query(
      `SELECT COUNT(*)::int AS count, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS score FROM interview_responses WHERE session_id = $1`,
      [Number(session_id)]
    );
    const answeredCount = Number(answeredCountResult.rows[0]?.count) || 0;
    const score = Number(answeredCountResult.rows[0]?.score) || 0;
    const targetCount = Number(session.total_questions || session.target_questions) || 10;

    await client.query(
      `UPDATE interview_sessions SET current_theta = $1, score = $2 WHERE id = $3`,
      [thetaAfter, score, Number(session_id)]
    );

    if (answeredCount >= targetCount) {
      await client.query(
        `UPDATE interview_sessions SET is_submitted = true, completed_at = CURRENT_TIMESTAMP, total_questions = $1, score = $2 WHERE id = $3`,
        [answeredCount, score, Number(session_id)]
      );
      await client.query('COMMIT');
      void sendCompletionReport(Number(session_id));
      return res.json({ success: true, isFinished: true, score, theta: thetaAfter, answered: answeredCount, total: answeredCount });
    }

    const nextQuestion = await createNextAdaptiveQuestion(
      client,
      Number(session_id),
      session,
      session.role || 'General',
      Number(session.experience_years) || 0,
      selectionThetaAfterAnswer(thetaAfter, itemDifficulty, isCorrect)
    );

    if (!nextQuestion) {
      await client.query(
        `UPDATE interview_sessions SET is_submitted = true, completed_at = CURRENT_TIMESTAMP, total_questions = $1, score = $2 WHERE id = $3`,
        [answeredCount, score, Number(session_id)]
      );
      await client.query('COMMIT');
      void sendCompletionReport(Number(session_id));
      return res.json({ success: true, isFinished: true, score, theta: thetaAfter, answered: answeredCount, total: answeredCount });
    }

    await client.query('COMMIT');
    return res.json({
      success: true,
      isFinished: false,
      isCorrect,
      theta: thetaAfter,
      answered: answeredCount,
      total: targetCount,
      question: formatQuestionForClient(nextQuestion),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Adaptive answer error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process adaptive answer' });
  } finally {
    client.release();
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

    for (const ans of answers) {
      const qResult = await client.query(
        'SELECT correct_answer FROM interview_questions WHERE id = $1',
        [ans.question_id]
      );

      const isCorrect = qResult.rows[0]?.correct_answer === ans.selected_answer;
      const exists = await client.query(
        `SELECT id FROM interview_responses WHERE session_id = $1 AND question_id = $2 LIMIT 1`,
        [session_id, ans.question_id]
      );

      if (!exists.rows.length) {
        await client.query(
          `INSERT INTO interview_responses (session_id, question_id, selected_answer, is_correct) 
           VALUES ($1, $2, $3, $4)`,
          [session_id, ans.question_id, ans.selected_answer, isCorrect]
        );
      }
    }

    const scoreResult = await client.query(
      `SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS score FROM interview_responses WHERE session_id = $1`,
      [session_id]
    );
    const score = Number(scoreResult.rows[0]?.score) || 0;
    const totalAnswered = Number(scoreResult.rows[0]?.total) || answers.length;

    await client.query(
      `UPDATE interview_sessions 
       SET is_submitted = true, score = $1, total_questions = $2, completed_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [score, totalAnswered, session_id]
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

    const sessionIds = data.map((row: any) => Number(row.session_id)).filter(Boolean);
    if (sessionIds.length) {
      const detailResult = await pool.query(
        `
        WITH response_rows AS (
          SELECT
            r.session_id,
            r.question_id,
            r.selected_answer,
            r.is_correct,
            r.theta_before,
            r.theta_after,
            r.created_at,
            q.question,
            q.options,
            q.correct_answer,
            q.difficulty,
            q.difficulty_score,
            s.started_at,
            LAG(r.created_at) OVER (PARTITION BY r.session_id ORDER BY r.created_at) AS prev_answered_at
          FROM interview_responses r
          JOIN interview_questions q ON q.id = r.question_id
          JOIN interview_sessions s ON s.id = r.session_id
          WHERE r.session_id = ANY($1::int[])
        )
        SELECT
          *,
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (created_at - COALESCE(prev_answered_at, started_at)))
          )::int AS time_spent_seconds
        FROM response_rows
        ORDER BY session_id, created_at ASC
        `,
        [sessionIds]
      );

      const bySession = new Map<number, any[]>();
      detailResult.rows.forEach((row: any) => {
        const sid = Number(row.session_id);
        if (!bySession.has(sid)) bySession.set(sid, []);
        bySession.get(sid)!.push({
          question_id: row.question_id,
          question: row.question,
          options: row.options,
          selected_answer: row.selected_answer,
          correct_answer: row.correct_answer,
          is_correct: Boolean(row.is_correct),
          difficulty: row.difficulty,
          difficulty_score: Number(row.difficulty_score) || 0,
          theta_before: row.theta_before != null ? Number(row.theta_before) : null,
          theta_after: row.theta_after != null ? Number(row.theta_after) : null,
          time_spent_seconds: Number(row.time_spent_seconds) || 0,
        });
      });

      data.forEach((row: any) => {
        row.details = bySession.get(Number(row.session_id)) || [];
      });
    }

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
