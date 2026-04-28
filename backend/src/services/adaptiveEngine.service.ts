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
  private static MAX_QUESTIONS = 10;
  private static STOPPING_SEM = 0.35;

  /**
   * Initialize a new adaptive session
   */
  public static async initializeSession(
    candidateEmail: string,
    skill: string,
    experienceYears?: number,
    maxQuestions: number = 10
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

    console.log(`\x1b[36m🎯 IRT SESSION STARTING for \x1b[1m${candidateEmail}\x1b[0m \x1b[36min skill\x1b[0m \x1b[1m${skill}\x1b[0m`);
    console.log(`   └─ Initial Ability Estimate (θ): \x1b[33m${initialTheta.toFixed(2)}\x1b[0m`);

    return {
      candidateId,
      candidateEmail,
      skill,
      currentTheta: initialTheta,
      questionCount: 0,
      maxQuestions: maxQuestions,
      attemptedQuestionIds: []
    };
  }

  /**
   * Select the most informative next question
   */
  public static async getNextQuestion(session: AdaptiveSessionState) {
    const { skill, currentTheta, attemptedQuestionIds } = session;

    // Clean up skill name for more lenient matching (e.g., mern_developer -> mern%developer)
    const searchPattern = `%${skill.replace(/[_-]/g, '%')}%`;

    const query = `
      SELECT q.*, 
             ABS(q.difficulty_b - $1) as diff_distance,
             jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
      FROM questions q
      JOIN question_options o ON q.question_id = o.question_id
      WHERE (q.skill_tag ILIKE $2 OR q.skill_tag ILIKE $3)
        AND q.question_id NOT IN (${attemptedQuestionIds.length > 0 ? attemptedQuestionIds.join(',') : '-1'})
      GROUP BY q.question_id
      ORDER BY diff_distance ASC, q.discrimination_a DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [currentTheta, skill, searchPattern]);

    if (result.rows.length > 0) {
      const bestMatch = result.rows[0];
      if (bestMatch.diff_distance < 1.0) {
        const shortText = bestMatch.question_text.length > 60 ? bestMatch.question_text.substring(0, 57) + '...' : bestMatch.question_text;
        console.log(`\x1b[35m🔍 Adaptive Selection:\x1b[0m Matching Item Bank`);
        console.log(`   ├─ Question: "${shortText}"`);
        console.log(`   └─ Item Difficulty (b): \x1b[33m${bestMatch.difficulty_b.toFixed(2)}\x1b[0m (Current θ: ${currentTheta.toFixed(2)}, Distance: ${bestMatch.diff_distance.toFixed(3)})`);
        return bestMatch;
      }
    }

    // 2. FALLBACK to AI: Generate tailored question with Gemini
    console.log(`\x1b[34m🤖 Adaptive Fallback:\x1b[0m Item Bank low for '${skill}' @ θ ${currentTheta.toFixed(2)}. Calling Gemini...`);
    try {
      const { GeminiQuestionService } = await import('./geminiQuestion.service');
      const aiQuestion = await GeminiQuestionService.generateQuestion(skill, currentTheta);

      if (aiQuestion) {
        const shortText = aiQuestion.question_text.length > 60 ? aiQuestion.question_text.substring(0, 57) + '...' : aiQuestion.question_text;
        console.log(`\x1b[34m🤖 AI Generation Success:\x1b[0m Tailored question generated`);
        console.log(`   ├─ Question: "${shortText}"`);
        console.log(`   └─ AI Est. Difficulty (b): \x1b[33m${aiQuestion.difficulty_b.toFixed(2)}\x1b[0m`);

        const { CalibrationService } = await import('./calibration.service');
        const savedResult = await CalibrationService.injectAIQuestion({
          text: aiQuestion.question_text,
          options: aiQuestion.options,
          correct: aiQuestion.correct_option,
          skill: aiQuestion.skill_tag,
          aiEstimateDifficulty: aiQuestion.difficulty_b
        });
        
        // Return in same format as DB query (with options)
        return {
          ...savedResult.rows[0],
          options: aiQuestion.options
        };
      }
    } catch (e) {
      console.error("AI Fallback failed:", e);
    }

    // 3. FINAL FALLBACK: If everything failed, try to get ANY question from 'General' skill
    if (result.rows.length === 0) {
      console.log(`\x1b[33m⚠️  Adaptive Crisis:\x1b[0m No questions for '${skill}' and AI failed. Falling back to 'General'...`);
      const generalFallback = await pool.query(`
        SELECT q.*, 
               ABS(q.difficulty_b - $1) as diff_distance,
               jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
        FROM questions q
        JOIN question_options o ON q.question_id = o.question_id
        WHERE q.skill_tag ILIKE 'General'
          AND q.question_id NOT IN (${attemptedQuestionIds.length > 0 ? attemptedQuestionIds.join(',') : '-1'})
        GROUP BY q.question_id
        ORDER BY diff_distance ASC
        LIMIT 1
      `, [currentTheta]);
      
      if (generalFallback.rows.length > 0) {
        console.log(`\x1b[32m✅ Crisis Averted:\x1b[0m Found a General question.`);
        return generalFallback.rows[0];
      }
      
      // 4. ABSOLUTE LAST RESORT: Get ANY question from the DB regardless of skill
      console.log(`\x1b[31m💣 Total Bank Exhaustion:\x1b[0m No skill-matched or General questions. Pulling ANY question...`);
      const absoluteLastResort = await pool.query(`
        SELECT q.*, 
               ABS(q.difficulty_b - $1) as diff_distance,
               jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
        FROM questions q
        JOIN question_options o ON q.question_id = o.question_id
        WHERE q.question_id NOT IN (${attemptedQuestionIds.length > 0 ? attemptedQuestionIds.join(',') : '-1'})
        GROUP BY q.question_id
        ORDER BY RANDOM()
        LIMIT 1
      `, [currentTheta]);
      
      if (absoluteLastResort.rows.length > 0) {
        return absoluteLastResort.rows[0];
      }
    }

    return result.rows.length > 0 ? result.rows[0] : null;
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
      'SELECT question_text, difficulty_b, discrimination_a, guessing_c, skill_tag FROM questions WHERE question_id = $1',
      [questionId]
    );

    if (qResult.rows.length === 0) throw new Error('Question not found');
    const { question_text, ...params } = qResult.rows[0];

    // 2. Update Theta
    const thetaBefore = session.currentTheta;
    const thetaAfter = IRTService.updateTheta(thetaBefore, params, isCorrect);
    
    // Log Calibration
    const shift = thetaAfter - thetaBefore;
    const direction = shift >= 0 ? '\x1b[32m⬆️ INCREASE\x1b[0m' : '\x1b[31m⬇️ DECREASE\x1b[0m';
    const shortText = question_text.length > 60 ? question_text.substring(0, 57) + '...' : question_text;
    
    console.log(`\x1b[32m📊 IRT Update [Q${session.questionCount + 1}]:\x1b[0m ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`   ├─ Question: "${shortText}"`);
    console.log(`   └─ θ Shift: ${thetaBefore.toFixed(3)} ➔ ${thetaAfter.toFixed(3)} (${direction}: ${Math.abs(shift).toFixed(3)})`);

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
