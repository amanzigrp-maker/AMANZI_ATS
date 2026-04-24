
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface GeneratedQuestion {
  question_text: string;
  options: { [key: string]: string };
  correct_option: string;
  skill_tag: string;
  difficulty_b: number;
}

export class GeminiQuestionService {
  /**
   * Generate an adaptive question using Gemini
   * @param skill The technical topic (e.g., 'React', 'Node.js', 'PostgreSQL')
   * @param targetTheta The target difficulty (b parameter) from -3 to 3
   */
  public static async generateQuestion(skill: string, targetTheta: number): Promise<GeneratedQuestion | null> {
    let retries = 2;
    let delay = 1000;

    while (retries >= 0) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Map theta to human-readable difficulty
        let difficultyLabel = "Medium";
        if (targetTheta < -1.5) difficultyLabel = "Very Easy";
        else if (targetTheta < -0.5) difficultyLabel = "Easy";
        else if (targetTheta > 1.5) difficultyLabel = "Very Hard";
        else if (targetTheta > 0.5) difficultyLabel = "Hard";

        const prompt = `
          Generate a technical interview multiple-choice question for: ${skill}.
          Difficulty level: ${difficultyLabel} (IRT target theta: ${targetTheta}).
          
          The response MUST be a JSON object with exactly these fields:
          {
            "question_text": "The text of the question",
            "options": {
              "A": "Option A text",
              "B": "Option B text",
              "C": "Option C text",
              "D": "Option D text"
            },
            "correct_option": "A",
            "skill_tag": "${skill}",
            "difficulty_b": ${targetTheta}
          }
          
          Ensure the question is deep and tests conceptual knowledge, not just syntax.
          Do NOT include any markdown or extra text outside the JSON.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const question: GeneratedQuestion = JSON.parse(cleanJson);

        return question;
      } catch (error: any) {
        if (error?.status === 429 && retries > 0) {
          console.warn(`⚠️  Gemini Rate Limited (429). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
          delay *= 2;
          continue;
        }
        console.error("❌ Gemini Question Generation Error:", error);
        return null;
      }
    }
    return null;
  }
}
