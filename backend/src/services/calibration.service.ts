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
   * Helper to normalize AI-generated question parameters
   */
  public static async injectAIQuestion(data: {
    text: string;
    options: any;
    correct: string;
    skill: string;
    aiEstimateDifficulty: number; // -3 to 3
  }) {
    return await pool.query(
      `INSERT INTO questions 
       (question_text, metadata, correct_option, skill_tag, difficulty_b, source) 
       VALUES ($1, $2, $3, $4, $5, 'AI') RETURNING *`,
      [data.text, data.options, data.correct, data.skill, data.aiEstimateDifficulty]
    );
  }
}
