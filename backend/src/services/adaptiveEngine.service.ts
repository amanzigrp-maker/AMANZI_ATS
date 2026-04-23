import { pool } from '../lib/database';
import { IRTService, IRTParameters } from './irt.service';

export interface AdaptiveSessionState {
  candidateId?: number;
  candidateEmail: string;
  skill: string;
  currentTheta: number;
  questionCount: number;
  maxQuestions: number;
  attemptedQuestionIds: number[];
}

export class AdaptiveEngineService {
  private static MAX_QUESTIONS = 15;
  private static STOPPING_SEM = 0.3;

  /**
   * Initialize a new adaptive session
   */
  public static async initializeSession(
    candidateEmail: string,
    skill: string,
    experienceYears?: number
  ): Promise<AdaptiveSessionState> {
    // Initial Theta based on experience
    let initialTheta = 0;
    if (experienceYears !== undefined) {
      if (experienceYears === 0) initialTheta = -0.5;
      else if (experienceYears <= 3) initialTheta = 0;
      else initialTheta = 0.5;
    }

    // Check if we have an existing theta for this skill
    const existing = await pool.query(
      'SELECT theta, candidate_id FROM candidate_skill_theta WHERE candidate_email = $1 AND skill = $2',
      [candidateEmail, skill]
    );

    let candidateId = existing.rows.length > 0 ? existing.rows[0].candidate_id : null;

    if (!candidateId) {
      // Fetch candidateId from interview_users table
      const userRes = await pool.query('SELECT id FROM interview_users WHERE email = $1', [candidateEmail]);
      if (userRes.rows.length > 0) {
        candidateId = userRes.rows[0].id;
      }
    }

    if (existing.rows.length > 0) {
      initialTheta = existing.rows[0].theta;
    } else {
      // Save initial theta
      await pool.query(
        'INSERT INTO candidate_skill_theta (candidate_email, candidate_id, skill, theta) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [candidateEmail, candidateId, skill, initialTheta]
      );
    }

    return {
      candidateId,
      candidateEmail,
      skill,
      currentTheta: initialTheta,
      questionCount: 0,
      maxQuestions: this.MAX_QUESTIONS,
      attemptedQuestionIds: []
    };
  }

  /**
   * Select the most informative next question
   */
  public static async getNextQuestion(session: AdaptiveSessionState) {
    const { skill, currentTheta, attemptedQuestionIds } = session;

    // FIND BEST QUESTION: Closest difficulty_b to current theta
    const query = `
      SELECT q.*, 
             ABS(q.difficulty_b - $1) as diff_distance
      FROM questions q
      WHERE q.skill_tag = $2
        AND q.question_id NOT IN (${attemptedQuestionIds.length > 0 ? attemptedQuestionIds.join(',') : '-1'})
      ORDER BY diff_distance ASC, q.discrimination_a DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [currentTheta, skill]);

    if (result.rows.length === 0) {
      // Fallback: If no manually calibrated questions, try any question with this tag
      // In a real production system, this is where we'd call Gemini to generate a question 
      // at difficulty = currentTheta
      return null;
    }

    return result.rows[0];
  }

  /**
   * Process candidate response and update ability
   */
  public static async submitAnswer(
    session: AdaptiveSessionState,
    questionId: number,
    isCorrect: boolean
  ): Promise<{ newTheta: number; isFinished: boolean }> {
    // 1. Get question parameters
    const qResult = await pool.query(
      'SELECT difficulty_b, discrimination_a, guessing_c, skill_tag FROM questions WHERE question_id = $1',
      [questionId]
    );

    if (qResult.rows.length === 0) throw new Error('Question not found');
    const params: IRTParameters = qResult.rows[0];

    // 2. Update Theta
    const thetaBefore = session.currentTheta;
    const thetaAfter = IRTService.updateTheta(thetaBefore, params, isCorrect);
    
    // 3. Record Response
    await pool.query(
      `INSERT INTO irt_responses 
       (candidate_email, candidate_id, question_id, is_correct, theta_before, theta_after) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.candidateEmail, session.candidateId, questionId, isCorrect, thetaBefore, thetaAfter]
    );

    // 4. Update Persistent Theta
    await pool.query(
      'UPDATE candidate_skill_theta SET theta = $1, updated_at = NOW() WHERE candidate_email = $2 AND skill = $3',
      [thetaAfter, session.candidateEmail, session.skill]
    );

    session.currentTheta = thetaAfter;
    session.questionCount++;
    session.attemptedQuestionIds.push(questionId);

    // 5. Check Stopping Conditions
    const sem = IRTService.calculateSEM(session.questionCount);
    const isFinished = session.questionCount >= session.maxQuestions || sem < this.STOPPING_SEM;

    return { 
      newTheta: thetaAfter, 
      isFinished 
    };
  }

  /**
   * Get skill-wise proficiency report for a candidate
   */
  public static async getCandidateReport(candidateEmail: string) {
    const result = await pool.query(
      'SELECT skill, theta, updated_at FROM candidate_skill_theta WHERE candidate_email = $1',
      [candidateEmail]
    );
    
    return result.rows.map(row => ({
      skill: row.skill,
      theta: row.theta,
      percentile: this.thetaToPercentile(row.theta),
      lastUpdated: row.updated_at
    }));
  }

  /**
   * Helper: Map theta (-4 to +4) to a 0-100 score/percentile
   */
  private static thetaToPercentile(theta: number): number {
    // Standard normal CDF approximation
    const t = Math.max(-3, Math.min(3, theta));
    return Math.round((1 / (1 + Math.exp(-1.702 * t))) * 100);
  }
}
