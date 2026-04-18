import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

const initAI = () => {
  if (genAI) return;
  const apiKey = process.env.GEMINI_API_KEY || "";
  const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: modelName });
};

// ... existing AdaptiveQuestion interface if needed elsewhere ...

export interface AdaptiveSequenceItem {
  q_no: number;
  question: string;
  options: string[];
  correct_answer: string;
  difficulty: 'basic' | 'medium' | 'advanced';
}

export interface AdaptiveSequenceResponse {
  questions: AdaptiveSequenceItem[];
  summary: {
    total_questions: number;
    difficulty_progression: string[];
    score: number;
  };
}

/**
 * Generate a full sequence of adaptive questions with simulated progression.
 */
export const generateAdaptiveSequence = async (
  role: string,
  experience: number,
  skill: string,
  total_questions: number
): Promise<AdaptiveSequenceResponse> => {
  initAI();
  try {
    const prompt = `
      You are an AI Adaptive Interview Question Engine. Generate a sequence of ${total_questions} questions for a ${role} with ${experience} years experience.
      
      Requirements:
      1. Each question must have exactly 4 options.
      2. The correct_answer must be the exact text of one of the options.
      3. For a sequence of ${total_questions} questions, provide a mix of basic, medium, and advanced levels.
      4. Each question must include a "difficulty" field with value "basic", "medium", or "advanced".
      
      ---
      ## 📦 OUTPUT FORMAT (STRICT JSON)
      {
        "questions": [
          {
            "q_no": 1,
            "difficulty": "basic" | "medium" | "advanced",
            "question": "...",
            "options": ["A","B","C","D"],
            "correct_answer": "..."
          }
        ],
        "summary": {
          "total_questions": ${total_questions},
          "difficulty_progression": ["basic", "medium", ...],
          "score": 0
        }
      }

      ---
      ## 🚫 STRICT RULES
      * OUTPUT ONLY JSON | NO markdown | NO text outside JSON.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Find the JSON block even if there is text before or after
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response:", text);
      throw new Error("AI returned invalid question format");
    }
    
    const sequence: AdaptiveSequenceResponse = JSON.parse(jsonMatch[0]);

    if (!sequence.questions || !Array.isArray(sequence.questions)) {
       throw new Error("AI sequence missing questions array");
    }

    return sequence;
  } catch (error) {
    console.error("Adaptive Sequence Generation Error:", error);
    throw error;
  }
};
