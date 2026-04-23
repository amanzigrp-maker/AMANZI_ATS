/**
 * IRT Service - Item Response Theory Calculations
 * Implements 3PL (3-Parameter Logistic) Model
 */

export interface IRTParameters {
  difficulty_b: number;      // Item difficulty
  discrimination_a: number; // Item discrimination (slope)
  guessing_c: number;       // Guessing parameter (lower asymptote)
}

export class IRTService {
  /**
   * Calculate probability of correct response given theta (ability) and item parameters
   * Formula: P(θ) = c + (1 - c) * (1 / (1 + exp(-a(θ - b))))
   */
  public static calculateProbability(theta: number, params: IRTParameters): number {
    const { difficulty_b, discrimination_a, guessing_c } = params;
    
    // Logistic function component: 1 / (1 + exp(-a(θ-b)))
    const exponent = -discrimination_a * (theta - difficulty_b);
    const logistic = 1 / (1 + Math.exp(exponent));
    
    // 3PL combination
    return guessing_c + (1 - guessing_c) * logistic;
  }

  /**
   * Update candidate ability (theta) based on response
   * This uses a stochastic update approach (Elo-like or SGD) which is 
   * efficient for real-time adaptive testing.
   * 
   * @param currentTheta Current ability estimate
   * @param params Item parameters
   * @param isCorrect Whether response was correct
   * @param learningRate Adjustment factor (0.1 - 0.3)
   */
  public static updateTheta(
    currentTheta: number,
    params: IRTParameters,
    isCorrect: boolean,
    learningRate: number = 0.2
  ): number {
    const prob = this.calculateProbability(currentTheta, params);
    
    let newTheta: number;
    if (isCorrect) {
      // If correct, increase theta proportionally to how "unexpected" it was
      newTheta = currentTheta + learningRate * (1 - prob);
    } else {
      // If incorrect, decrease theta proportionally to how "certain" we were
      newTheta = currentTheta - learningRate * prob;
    }

    // Clamp theta to reasonable bounds (e.g., -4 to +4)
    return Math.max(-4, Math.min(4, newTheta));
  }

  /**
   * Calculate Standard Error of Measurement (SEM)
   * This helps determine when to stop the test
   */
  public static calculateSEM(attempts: number): number {
    if (attempts === 0) return 1.0;
    // Simplified SEM: 1 / sqrt(Information)
    // Here we use a heuristic based on number of items
    return 1 / Math.sqrt(attempts);
  }
}
