import { pool } from '../lib/database';
import { AdaptiveEngineService } from '../services/adaptiveEngine.service';

/**
 * Service to handle maintenance and calibration of the IRT Item Bank
 */
export class CalibrationService {
  /**
   * Calibrate question difficulty based on empirical performance (CTT approach)
   * Run this periodically (e.g., cron job) after every 10-20 attempts per question.
   */
  public static async recalibrateDifficulties() {
    console.log('🔄 Starting Question Calibration Loop...');
    
    // Calculate accuracy for each question with more than 5 attempts
    const query = `
      SELECT question_id, 
             COUNT(*) as attempts,
             AVG(CASE WHEN is_correct THEN 1.0 ELSE 0.0 END) as accuracy
      FROM irt_responses
      GROUP BY question_id
      HAVING COUNT(*) >= 5
    `;

    const result = await pool.query(query);

    for (const row of result.rows) {
      const { question_id, accuracy } = row;
      
      /**
       * Map Accuracy to Difficulty (b)
       * Accuracy 0.5 (50%) -> b ≈ 0 (Medium)
       * Accuracy 0.9 (90%) -> b ≈ -2 (Easy)
       * Accuracy 0.1 (10%) -> b ≈ +2 (Hard)
       * Formula: b = -ln(accuracy / (1 - accuracy)) - Simple logit transformation
       */
      let newB = 0;
      if (accuracy > 0.99) newB = -3.0;
      else if (accuracy < 0.01) newB = 3.0;
      else newB = -Math.log(accuracy / (1 - accuracy));

      // Update question bank
      await pool.query(
        'UPDATE questions SET difficulty_b = $1 WHERE question_id = $2',
        [newB, question_id]
      );
    }
    
    console.log(`✅ Recalibrated ${result.rows.length} questions`);
  }

  /**
   * Inject an AI-generated question into the bank
   */
  public static async injectAIQuestion(data: {
    text: string;
    options: { [key: string]: string };
    correct: string;
    skill: string;
    aiEstimateDifficulty: number;
  }) {
    // 1. Ensure System Assessment & Set exist
    let assessmentId: number;
    let setId: number;

    const assessResult = await pool.query("SELECT assessment_id FROM assessments WHERE title = 'System AI Adaptive Bank'");
    if (assessResult.rows.length === 0) {
      const newAssess = await pool.query(
        "INSERT INTO assessments (title, description, role, status) VALUES ('System AI Adaptive Bank', 'Auto-generated questions from adaptive engine', 'System', 'active') RETURNING assessment_id"
      );
      assessmentId = newAssess.rows[0].assessment_id;
    } else {
      assessmentId = assessResult.rows[0].assessment_id;
    }

    const setResult = await pool.query("SELECT question_set_id FROM question_sets WHERE assessment_id = $1 AND name = 'Adaptive General'", [assessmentId]);
    if (setResult.rows.length === 0) {
      const newSet = await pool.query(
        "INSERT INTO question_sets (assessment_id, name, source_type) VALUES ($1, 'Adaptive General', 'ai') RETURNING question_set_id",
        [assessmentId]
      );
      setId = newSet.rows[0].question_set_id;
    } else {
      setId = setResult.rows[0].question_set_id;
    }

    // 2. Insert Question
    const qResult = await pool.query(
      `INSERT INTO questions 
       (question_set_id, question_text, correct_option, skill_tag, difficulty_b, source) 
       VALUES ($1, $2, $3, $4, $5, 'AI') RETURNING *`,
      [setId, data.text, data.correct, data.skill, data.aiEstimateDifficulty]
    );

    const questionId = qResult.rows[0].question_id;

    // 3. Insert Options
    for (const [key, text] of Object.entries(data.options)) {
      await pool.query(
        "INSERT INTO question_options (question_id, option_key, option_text) VALUES ($1, $2, $3)",
        [questionId, key, text]
      );
    }

    return qResult;
  }
}
