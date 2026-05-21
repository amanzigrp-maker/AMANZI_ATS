
import { pool } from "../../lib/database";
import { geminiService } from "../../services/gemini.service";
import { DifficultyLevel } from "../../common/types";

export interface CandidateExperienceProfile {
    yearsOfExperience: number;
    role: string;
    skills: string[];
    projects: string[];
    domain?: string;
    seniority: string;
}

export class AdaptiveAssessmentService {

    /**
     * Maps years of experience to target cognitive levels and difficulty
     */
    private static getExperienceRules(yoe: number) {
        if (yoe < 1) return { difficulty: DifficultyLevel.BASIC, cognitive: ["recall", "apply"], focus: "syntax, fundamentals" };
        if (yoe < 3) return { difficulty: DifficultyLevel.MEDIUM, cognitive: ["apply", "analyze"], focus: "implementation, API usage" };
        if (yoe < 5) return { difficulty: DifficultyLevel.ADVANCED, cognitive: ["analyze", "evaluate"], focus: "optimization, architecture basics" };
        if (yoe < 8) return { difficulty: DifficultyLevel.ADVANCED, cognitive: ["evaluate", "analyze"], focus: "system design, distributed systems, performance" };
        return { difficulty: DifficultyLevel.EXPERT, cognitive: ["evaluate"], focus: "architecture tradeoffs, scalability, leadership" };
    }

    /**
     * Generates a grounded, experience-aware question
     */
    public static async generateGroundedQuestion(profile: CandidateExperienceProfile, currentTheta: number, recentQuestions: string[]): Promise<any> {
        const rules = this.getExperienceRules(profile.yearsOfExperience);
        
        // Map currentTheta (0-1) to difficulty label
        let targetDifficulty = DifficultyLevel.MEDIUM;
        if (currentTheta < 0.3) targetDifficulty = DifficultyLevel.BASIC;
        else if (currentTheta > 0.7) targetDifficulty = DifficultyLevel.ADVANCED;
        if (profile.yearsOfExperience > 8 && currentTheta > 0.8) targetDifficulty = DifficultyLevel.EXPERT;

        const prompt = `
            You are an expert technical interviewer. Generate a technical MCQ question.
            
            CANDIDATE PROFILE:
            - Role: ${profile.role}
            - Experience: ${profile.yearsOfExperience} years
            - Domain: ${profile.domain || "General Tech"}
            - Skills: ${profile.skills.join(", ")}
            - Key Projects: ${profile.projects.join(", ")}
            
            ADAPTIVE PARAMETERS:
            - Target Difficulty: ${targetDifficulty}
            - Current Ability Level (Theta): ${currentTheta.toFixed(2)}
            - Cognitive Focus: ${rules.cognitive.join("/")}
            - Technical Focus: ${rules.focus}
            
            CONSTRAINTS:
            - Ground the question in the candidate's project context if possible.
            - Focus on ${profile.skills[Math.floor(Math.random() * profile.skills.length)]}.
            - Do NOT repeat these topics: ${recentQuestions.join(", ")}.
            - Ensure the question tests conceptual depth, not just syntax.
            - Include a "code-snippet" if the difficulty is Advanced or higher.
            
            OUTPUT FORMAT (JSON only):
            {
                "question_text": "...",
                "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
                "correct_option": "A",
                "explanation": "...",
                "skill_tag": "...",
                "difficulty_score": ${currentTheta}
            }
        `;

        const responseText = await geminiService.generateContent(prompt);
        // Robust JSON parsing
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("AI failed to return valid JSON");
        
        return JSON.parse(jsonMatch[0]);
    }

    /**
     * Updates candidate ability (Theta) using Elo-style logic (Section 2)
     */
    public static updateAbility(currentTheta: number, itemDifficulty: number, isCorrect: boolean): number {
        const kFactor = 0.1; // Learning rate
        const expected = 1 / (1 + Math.exp(-8 * (currentTheta - itemDifficulty)));
        const score = isCorrect ? 1 : 0;
        
        let newTheta = currentTheta + kFactor * (score - expected);
        return Math.min(Math.max(newTheta, 0.05), 0.95); // Clamp between 0.05 and 0.95
    }
}
