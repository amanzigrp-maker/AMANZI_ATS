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
  difficulty: number;
  question: string;
  options: string[];
  correct_answer: string;
  candidate_answer: string;
  is_correct: boolean;
  explanation: string;
  next_level: number;
}

export interface AdaptiveSequenceResponse {
  questions: AdaptiveSequenceItem[];
  summary: {
    total_questions: number;
    difficulty_progression: number[];
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
      You are an AI Adaptive Interview Question Engine.
      Your job is to generate MULTIPLE questions in sequence using adaptive difficulty logic.

      ---
      ## 📥 INPUT
      {
        "role": "${role}",
        "experience": "${experience}",
        "skill": "${skill}",
        "total_questions": ${total_questions}
      }

      ---
      ## 🧠 ADAPTIVE RULES (STRICT)
      * Start with MEDIUM level (level = 2)
      * IF answer is CORRECT: level +1 (Max 3)
      * IF answer is WRONG: level -1 (Min 1)
      * Level 1 + wrong → stay at 1
      * Level 3 + correct → stay at 3

      ---
      ## 📊 DIFFICULTY
      1 → EASY | 2 → MEDIUM | 3 → HARD

      ---
      ## ❓ QUESTION RULES
      * Generate ONE question at a time internally until ${total_questions} are reached.
      * Simulate candidate answer realistically (Mix of correct and wrong).
      * Output MUST be a strictly valid JSON.

      ---
      ## 📦 OUTPUT FORMAT (STRICT JSON)
      {
        "questions": [
          {
            "q_no": 1,
            "difficulty": 2,
            "question": "...",
            "options": ["A","B","C","D"],
            "correct_answer": "...",
            "candidate_answer": "...",
            "is_correct": true,
            "explanation": "...",
            "next_level": 3
          }
        ],
        "summary": {
          "total_questions": ${total_questions},
          "difficulty_progression": [2,3,...],
          "score": X
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
