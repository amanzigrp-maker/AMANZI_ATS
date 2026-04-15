import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

export interface MCQQuestion {
  question: string;
  options: string[];
  correct_answer: string;
}

export const generateAIQuestions = async (
  experience: number,
  role: string
): Promise<MCQQuestion[]> => {
  try {
    const prompt = `
      You are a senior recruiter. Generate exactly 5 challenging multiple choice questions for a candidate with ${experience} years of experience as a ${role}.
      
      Requirements:
      1. Each question must have exactly 4 options.
      2. The correct_answer must be the exact text of one of the options.
      3. Questions should be relevant to the ${role} role and ${experience} years experience level.
      4. Return ONLY a JSON array with the following structure, no other text:
      [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "correct_answer": "string"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Clean potential markdown formatting
    const jsonStr = text.replace(/```json|```/g, "").trim();
    const questions: MCQQuestion[] = JSON.parse(jsonStr);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Invalid response format from Gemini");
    }

    return questions;
  } catch (error) {
    console.error("Gemini Question Generation Error:", error);
    throw new Error("Failed to generate AI questions");
  }
};
