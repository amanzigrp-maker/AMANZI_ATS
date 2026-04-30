import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

const initAI = () => {
  if (genAI) return;
  const apiKey = process.env.GEMINI_API_KEY || "";
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: modelName });
};

// ... existing AdaptiveQuestion interface if needed elsewhere ...

export interface AdaptiveSequenceItem {
  q_no: number;
  question: string;
  options: string[];
  correct_answer: string;
  correct_answers?: string[];
  question_type?: 'single' | 'multiple';
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

export interface AdaptiveQuestionSemanticContext {
  relatedTopics?: string[];
  referenceQuestions?: string[];
  candidateContext?: string[];
}

export interface AdaptiveQuestionGenerationOptions {
  style?: 'mcq' | 'code-snippet';
  variationSeed?: string;
  allowMultiSelect?: boolean;
}

const looksTechnical = (role: string, skill: string, semanticContext: AdaptiveQuestionSemanticContext) => {
  const combined = [
    role,
    skill,
    ...(semanticContext.relatedTopics || []),
    ...(semanticContext.candidateContext || []),
  ]
    .join(' ')
    .toLowerCase();

  return [
    'java', 'javascript', 'typescript', 'python', 'react', 'node', 'sql', 'api', 'spring',
    'backend', 'frontend', 'full stack', 'fullstack', 'developer', 'programming', 'coding',
    'database', 'aws', 'docker', 'kubernetes', 'microservice', 'git', 'algorithm', 'oop'
  ].some((keyword) => combined.includes(keyword));
};

const buildFallbackQuestion = (
  role: string,
  skill: string,
  difficulty: 'basic' | 'medium' | 'advanced'
): AdaptiveSequenceItem => {
  const topic = skill || role || 'the role';
  const templates: Record<'basic' | 'medium' | 'advanced', AdaptiveSequenceItem> = {
    basic: {
      q_no: 1,
      difficulty,
      question: `Which approach is most appropriate when starting work on a ${topic} task?`,
      options: [
        'Clarify the requirement and expected outcome first',
        'Skip planning and start with the most complex part',
        'Ignore constraints until the final review',
        'Choose tools randomly without checking fit',
      ],
      correct_answer: 'Clarify the requirement and expected outcome first',
      question_type: 'single',
    },
    medium: {
      q_no: 1,
      difficulty,
      question: `In a ${topic} assessment, what is the best way to handle an ambiguous requirement?`,
      options: [
        'Make an assumption silently and continue',
        'Ask for clarification and document the assumption if needed',
        'Avoid the requirement completely',
        'Change the goal to match the easiest implementation',
      ],
      correct_answer: 'Ask for clarification and document the assumption if needed',
      question_type: 'single',
    },
    advanced: {
      q_no: 1,
      difficulty,
      question: `For a complex ${topic} problem, which decision best reduces long-term risk?`,
      options: [
        'Optimize only for the fastest short-term answer',
        'Use a validated approach, measure outcomes, and revise based on evidence',
        'Avoid testing because the design seems clear',
        'Prefer the newest method regardless of constraints',
      ],
      correct_answer: 'Use a validated approach, measure outcomes, and revise based on evidence',
      question_type: 'single',
    },
  };

  return templates[difficulty];
};

export const generateAdaptiveQuestionAtDifficulty = async (
  role: string,
  experience: number,
  skill: string,
  difficulty: 'basic' | 'medium' | 'advanced',
  semanticContext: AdaptiveQuestionSemanticContext = {},
  options: AdaptiveQuestionGenerationOptions = {}
): Promise<AdaptiveSequenceItem> => {
  initAI();
  const relatedTopics = Array.from(new Set((semanticContext.relatedTopics || []).map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 5);
  const referenceQuestions = (semanticContext.referenceQuestions || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
  const candidateContext = (semanticContext.candidateContext || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
  const technicalMode = looksTechnical(role, skill, semanticContext);
  const questionStyle = options.style || 'mcq';
  const allowMultiSelect = options.allowMultiSelect === true && difficulty !== 'basic';
  const snippetPreference = questionStyle === 'code-snippet'
    ? 'Use a compact code snippet as the center of the question. Ask the candidate to reason about output, bug fixing, behavior, or the next best code change.'
    : technicalMode && difficulty !== 'basic'
      ? 'Do not use a code snippet for this question. Keep it as a plain MCQ even if the focus area is technical.'
      : 'Keep this as a plain MCQ without a code snippet.';
  const variationInstruction = options.variationSeed
    ? `Use this variation seed to keep the question fresh for this candidate: ${options.variationSeed}. Do not repeat common textbook wording if a different realistic scenario can test the same idea.`
    : 'Use a fresh scenario instead of repeating common textbook wording.';

  const semanticPromptBlock = [
    relatedTopics.length ? `Semantic topics to stay close to:\n- ${relatedTopics.join('\n- ')}` : '',
    referenceQuestions.length ? `Semantically similar reference questions (do not copy them verbatim):\n- ${referenceQuestions.join('\n- ')}` : '',
    candidateContext.length ? `Candidate semantic context from resume/profile:\n- ${candidateContext.join('\n- ')}` : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `
    Generate exactly 1 multiple-choice interview assessment question for a ${role || 'candidate'} with ${experience || 0} years experience.
    Focus skill/topic: ${skill || 'General'}.
    Difficulty must be "${difficulty}".

    ${semanticPromptBlock ? `Use this semantic grounding to stay aligned with the right meaning/topic:\n${semanticPromptBlock}\n` : ''}

    Return only JSON:
    {
      "q_no": 1,
      "difficulty": "${difficulty}",
      "question": "...",
      "question_type": "single" | "multiple",
      "options": ["A","B","C","D"],
      "correct_answer": "exact option text",
      "correct_answers": ["exact option text", "exact option text"]
    }

    Rules:
    - Exactly 4 options.
    - For single-answer questions, correct_answer must exactly match one option and question_type must be "single".
    - For multi-select questions, question_type must be "multiple", correct_answers must contain 2 exact option texts, and correct_answer must repeat the first correct option.
    - Ask about ONLY the focus skill/topic above.
    - Do not list or combine multiple skills in the question.
    - Make the question practical and specific enough to test depth in that one skill.
    - Align the depth with the candidate's experience. Beginner profiles should get simpler, applied questions. Senior profiles should get harder scenario-based or debugging questions.
    - Maintain a smooth easy -> medium -> hard progression over the overall interview by respecting the requested difficulty for this question.
    - ${snippetPreference}
    - ${variationInstruction}
    - ${allowMultiSelect ? 'You may choose either a single-answer or a multi-select question. Use multi-select only when it feels natural and unambiguous.' : 'Use only a single-answer question for this difficulty.'}
    - If semantic grounding is provided, stay close to that meaning and candidate context while still producing a fresh question.
    - No markdown, no text outside JSON.
  `;

  let retries = 0;
  const maxRetries = 3;
  let lastError: any = null;

  while (retries < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI returned invalid question format");
      const question = JSON.parse(jsonMatch[0]) as AdaptiveSequenceItem;
      if (!question.question || !Array.isArray(question.options) || question.options.length !== 4 || !question.correct_answer) {
        throw new Error("AI question missing required fields");
      }
      const questionType = question.question_type === 'multiple' ? 'multiple' : 'single';
      if (questionType === 'multiple') {
        const dedupedAnswers = Array.from(new Set((question.correct_answers || []).map((item) => String(item || '').trim()).filter(Boolean)));
        if (dedupedAnswers.length < 2) {
          throw new Error("AI multi-select question missing at least two correct answers");
        }
        question.correct_answers = dedupedAnswers.slice(0, 2);
        question.correct_answer = question.correct_answers[0];
      } else {
        question.correct_answers = [question.correct_answer];
      }
      question.question_type = questionType;
      return question;
    } catch (error: any) {
      lastError = error;
      if (error.status === 503 || error.message?.includes("503") || error.message?.includes("high demand")) {
        retries++;
        const delay = Math.pow(2, retries) * 1000;
        console.warn(`⚠️ Gemini 503 (High Demand) in adaptive question. Retry ${retries}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error("Adaptive single-question generation failed, using fallback question:", error);
      return buildFallbackQuestion(role, skill, difficulty);
    }
  }
  return buildFallbackQuestion(role, skill, difficulty);
};

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

  let retries = 0;
  const maxRetries = 3;
  let lastError: any = null;

  while (retries < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

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
    } catch (error: any) {
      lastError = error;
      if (error.status === 503 || error.message?.includes("503") || error.message?.includes("high demand")) {
        retries++;
        const delay = Math.pow(2, retries) * 1000;
        console.warn(`⚠️ Gemini 503 (High Demand) in adaptive sequence. Retry ${retries}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error("Adaptive Sequence Generation Error:", error);
      throw error;
    }
  }
  throw lastError;
};
