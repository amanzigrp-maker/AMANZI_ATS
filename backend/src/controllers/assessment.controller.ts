import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pool } from "../lib/database";

type NormalizedQuestion = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
  difficulty?: string;
  topic?: string;
  explanation?: string;
  metadata?: Record<string, unknown>;
};

const optionKeys = ["A", "B", "C", "D"] as const;

const getUserId = (req: any) => Number(req.user?.userid ?? req.user?.id ?? 0) || null;

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

const normalizeCorrectOption = (value: unknown): "A" | "B" | "C" | "D" => {
  const raw = String(value || "").trim().toUpperCase();
  if (optionKeys.includes(raw as any)) return raw as "A" | "B" | "C" | "D";
  throw new Error("Each question needs correct_option as A, B, C, or D.");
};

const difficultyScore = (difficulty: unknown) => {
  const raw = String(difficulty || "medium").toLowerCase();
  if (raw.includes("foundation") || raw.includes("basic") || raw.includes("easy")) return 0.3;
  if (raw.includes("developing") || raw.includes("medium")) return 0.5;
  if (raw.includes("advanced")) return 0.72;
  if (raw.includes("expert") || raw.includes("hard")) return 0.88;
  return 0.5;
};

const validateQuestion = (question: any): NormalizedQuestion => {
  const normalized: NormalizedQuestion = {
    question_text: String(question.question_text || question.question || "").trim(),
    option_a: String(question.option_a || question.A || question.options?.[0] || "").trim(),
    option_b: String(question.option_b || question.B || question.options?.[1] || "").trim(),
    option_c: String(question.option_c || question.C || question.options?.[2] || "").trim(),
    option_d: String(question.option_d || question.D || question.options?.[3] || "").trim(),
    correct_option: normalizeCorrectOption(question.correct_option || question.correct_answer),
    difficulty: String(question.difficulty || "medium").trim().toLowerCase(),
    topic: String(question.topic || "").trim(),
    explanation: String(question.explanation || "").trim(),
    metadata: typeof question.metadata === "object" && question.metadata ? question.metadata : {},
  };

  if (!normalized.question_text || !normalized.option_a || !normalized.option_b || !normalized.option_c || !normalized.option_d) {
    throw new Error("Each question needs text and four options.");
  }

  return normalized;
};

const parseCsvQuestions = (csv: string): NormalizedQuestion[] => {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    return validateQuestion(row);
  });
};

const bufferSplit = (buffer: Buffer, separator: Buffer): Buffer[] => {
  const parts: Buffer[] = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);

  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }

  parts.push(buffer.subarray(start));
  return parts;
};

const readRequestBuffer = (req: Request): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const parseMultipartForm = async (req: Request) => {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Upload must use multipart/form-data.");

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readRequestBuffer(req);
  const fields: Record<string, string> = {};
  let file: { filename: string; mimetype: string; buffer: Buffer } | null = null;

  for (const rawPart of bufferSplit(body, boundary)) {
    let part = rawPart;
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (!part.length || part.toString("utf8", 0, 2) === "--") continue;

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headers = part.subarray(0, headerEnd).toString("utf8");
    let content = part.subarray(headerEnd + 4);
    if (content.subarray(content.length - 2).toString() === "\r\n") {
      content = content.subarray(0, content.length - 2);
    }

    const name = headers.match(/name="([^"]+)"/i)?.[1];
    const filename = headers.match(/filename="([^"]*)"/i)?.[1];
    const mimetype = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
    if (!name) continue;

    if (filename) {
      file = { filename: path.basename(filename), mimetype, buffer: content };
    } else {
      fields[name] = content.toString("utf8").trim();
    }
  }

  return { fields, file };
};

const extractPdfText = async (buffer: Buffer, originalName: string): Promise<string> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amanzi-assessment-"));
  const safeName = path.basename(originalName || "questions.pdf").replace(/[^\w.-]/g, "_");
  const inputPath = path.join(tempDir, safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`);
  const outputPath = path.join(tempDir, "questions.txt");
  const command = process.env.PDFTOTEXT_PATH || "pdftotext";

  try {
    await fs.writeFile(inputPath, buffer);
    await new Promise<void>((resolve, reject) => {
      execFile(command, ["-layout", inputPath, outputPath], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return await fs.readFile(outputPath, "utf8");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const parsePdfQuestions = (text: string): NormalizedQuestion[] => {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

  const answerKeyStart = normalized.search(/\bAnswer\s+Key\b/i);
  const questionText = answerKeyStart >= 0 ? normalized.slice(0, answerKeyStart) : normalized;
  const answerKeyText = answerKeyStart >= 0 ? normalized.slice(answerKeyStart) : "";
  const answerKey = new Map<number, "A" | "B" | "C" | "D">();

  for (const match of answerKeyText.matchAll(/\b(\d{1,4})\.\s*([A-D])\b/gi)) {
    const questionNumber = Number(match[1]);
    const option = normalizeCorrectOption(match[2]);
    if (questionNumber > 0) {
      answerKey.set(questionNumber, option);
    }
  }

  const blocks = questionText
    .split(/\n(?=\s*(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s+)/i)
    .map((block) => block.trim())
    .filter(Boolean);

  const questions: NormalizedQuestion[] = [];

  for (const block of blocks) {
    const questionNumber = Number(block.match(/^\s*(?:Q(?:uestion)?\.?\s*)?(\d+)[\).:-]\s*/i)?.[1] || 0);
    const answerMatch = block.match(/(?:correct\s*)?answer\s*[:\-]?\s*([A-D])/i);
    const answerFromKey = questionNumber > 0 ? answerKey.get(questionNumber) : undefined;
    const optionMatches = [...block.matchAll(/(?:^|\n)\s*([A-D])[\).:-]\s*([\s\S]*?)(?=\n\s*[A-D][\).:-]\s*|\n\s*(?:correct\s*)?answer\s*[:\-]?|\s*$)/gi)];
    if ((!answerMatch && !answerFromKey) || optionMatches.length < 4) continue;

    const firstOptionIndex = optionMatches[0].index || 0;
    const questionText = block
      .slice(0, firstOptionIndex)
      .replace(/^\s*(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s*/i, "")
      .trim();

    const byKey: Record<string, string> = {};
    optionMatches.slice(0, 4).forEach((match) => {
      byKey[match[1].toUpperCase()] = match[2].replace(/\n+/g, " ").trim();
    });

    const inferredDifficulty =
      questionNumber <= 60 ? "foundation" :
      questionNumber <= 130 ? "developing" :
      questionNumber <= 195 ? "advanced" :
      "expert";

    try {
      questions.push(
        validateQuestion({
          question_text: questionText,
          option_a: byKey.A,
          option_b: byKey.B,
          option_c: byKey.C,
          option_d: byKey.D,
          correct_option: answerFromKey || answerMatch?.[1],
          difficulty: inferredDifficulty,
          topic: block.match(/\bCompetency\s*:\s*([^\n]+)/i)?.[1]?.trim() || "",
          explanation: "",
          metadata: {
            source_parser: "pdf-text",
            answer_source: answerFromKey ? "answer-key-table" : "inline-answer",
            pdf_question_number: questionNumber || undefined,
          },
        })
      );
    } catch {
      // Skip malformed PDF blocks so one bad question does not reject a whole paper.
    }
  }

  return questions;
};

const fallbackQuestions = (role: string, topic: string, count: number): NormalizedQuestion[] => {
  const safeRole = role || "candidate";
  const safeTopic = topic || "core skills";
  return Array.from({ length: count }, (_, index) =>
    validateQuestion({
      question_text: `For a ${safeRole}, which approach best demonstrates practical strength in ${safeTopic}?`,
      option_a: "Choose a solution pattern, explain tradeoffs, and validate the outcome.",
      option_b: "Use the first familiar tool without checking requirements.",
      option_c: "Avoid documenting assumptions or edge cases.",
      option_d: "Optimize only for speed and ignore maintainability.",
      correct_option: "A",
      difficulty: index % 3 === 0 ? "basic" : index % 3 === 1 ? "medium" : "advanced",
      topic: safeTopic,
      explanation: "Strong assessment answers show reasoning, tradeoffs, and validation before final delivery.",
      metadata: { generated_by: "fallback" },
    })
  );
};

const generateAiQuestions = async (role: string, topic: string, count: number, prompt: string): Promise<NormalizedQuestion[]> => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) return fallbackQuestions(role, topic, count);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });
  const result = await model.generateContent(`
Generate ${count} recruiter assessment MCQs for role "${role || "General"}" and topic "${topic || "General skills"}".
Recruiter prompt: ${prompt || "Create fair practical screening questions."}

Return only JSON:
{
  "questions": [
    {
      "question_text": "...",
      "option_a": "...",
      "option_b": "...",
      "option_c": "...",
      "option_d": "...",
      "correct_option": "A",
      "difficulty": "basic|medium|advanced",
      "topic": "...",
      "explanation": "..."
    }
  ]
}

Rules: exactly one locked correct_option per question. No ambiguous answers. No markdown.
`);

  const text = result.response.text();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI returned an invalid question format.");
  const parsed = JSON.parse(match[0]);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  return questions.slice(0, count).map(validateQuestion);
};

const createAssessmentWithQuestions = async (
  req: Request,
  payload: {
    title: string;
    description?: string;
    role?: string;
    duration_minutes?: number;
    source_type: "ai" | "upload";
    source_file?: string;
    prompt?: string;
    questions: NormalizedQuestion[];
  }
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const assessment = await client.query(
      `
      INSERT INTO assessments (title, description, role, duration_minutes, status, created_by)
      VALUES ($1, $2, $3, $4, 'draft', $5)
      RETURNING *
      `,
      [
        payload.title,
        payload.description || "",
        payload.role || "",
        Number(payload.duration_minutes) || 30,
        getUserId(req),
      ]
    );

    const questionSet = await client.query(
      `
      INSERT INTO question_sets (assessment_id, name, source_type, source_file, prompt, review_status, metadata, created_by)
      VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7)
      RETURNING *
      `,
      [
        assessment.rows[0].assessment_id,
        "Default section",
        payload.source_type,
        payload.source_file || null,
        payload.prompt || null,
        JSON.stringify({ imported_count: payload.questions.length }),
        getUserId(req),
      ]
    );

    for (const question of payload.questions) {
      const insertedQuestion = await client.query(
        `
        INSERT INTO questions (
          question_set_id, question_text, difficulty, topic, explanation,
          correct_option, review_status, metadata, difficulty_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8)
        RETURNING question_id
        `,
        [
          questionSet.rows[0].question_set_id,
          question.question_text,
          question.difficulty || "medium",
          question.topic || null,
          question.explanation || null,
          question.correct_option,
          JSON.stringify(question.metadata || {}),
          difficultyScore(question.difficulty || "medium"),
        ]
      );

      const questionId = insertedQuestion.rows[0].question_id;
      const options = {
        A: question.option_a,
        B: question.option_b,
        C: question.option_c,
        D: question.option_d,
      };

      for (const key of optionKeys) {
        await client.query(
          `INSERT INTO question_options (question_id, option_key, option_text) VALUES ($1, $2, $3)`,
          [questionId, key, options[key]]
        );
      }
    }

    await client.query("COMMIT");
    return assessment.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const listAssessments = async (req: Request, res: Response) => {
  try {
    const role = String(req.query.role || "").trim();
    const user = (req as any).user || {};
    const userId = Number(user.userid ?? user.id ?? 0) || null;
    const userRole = String(user.role || "").toLowerCase();
    const params: any[] = [];
    const filters: string[] = [];

    if (role) {
      params.push(`%${role}%`);
      filters.push(`(a.role ILIKE $${params.length} OR a.title ILIKE $${params.length})`);
    }

    if (userId && userRole !== "admin" && userRole !== "lead") {
      params.push(userId);
      filters.push(`a.created_by = $${params.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query(`
      SELECT
        a.*,
        COUNT(q.question_id)::int AS question_count,
        COALESCE(MAX(qs.source_type), 'upload') AS source_type
      FROM assessments a
      LEFT JOIN question_sets qs ON qs.assessment_id = a.assessment_id
      LEFT JOIN questions q ON q.question_set_id = qs.question_set_id
      ${whereClause}
      GROUP BY a.assessment_id
      ORDER BY a.created_at DESC
    `, params);

    return res.json({ success: true, data: result.rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to load assessments" });
  }
};

export const getAssessment = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const assessment = await pool.query(`SELECT * FROM assessments WHERE assessment_id = $1`, [id]);
    if (!assessment.rows.length) return res.status(404).json({ error: "Assessment not found" });

    const questions = await pool.query(
      `
      SELECT
        q.question_id,
        q.question_text,
        q.difficulty,
        q.topic,
        q.explanation,
        q.correct_option,
        jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
      FROM question_sets qs
      JOIN questions q ON q.question_set_id = qs.question_set_id
      JOIN question_options o ON o.question_id = q.question_id
      WHERE qs.assessment_id = $1
      GROUP BY q.question_id
      ORDER BY q.question_id
      `,
      [id]
    );

    return res.json({ success: true, data: { ...assessment.rows[0], questions: questions.rows } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to load assessment" });
  }
};

export const getCandidateAssessment = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const assessment = await pool.query(
      `SELECT assessment_id, title, description, role, duration_minutes, status FROM assessments WHERE assessment_id = $1`,
      [id]
    );
    if (!assessment.rows.length) return res.status(404).json({ error: "Assessment not found" });

    const questions = await pool.query(
      `
      SELECT
        q.question_id,
        q.question_text,
        q.difficulty,
        q.topic,
        jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
      FROM question_sets qs
      JOIN questions q ON q.question_set_id = qs.question_set_id
      JOIN question_options o ON o.question_id = q.question_id
      WHERE qs.assessment_id = $1
      GROUP BY q.question_id
      ORDER BY q.question_id
      `,
      [id]
    );

    return res.json({ success: true, data: { ...assessment.rows[0], questions: questions.rows } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to load candidate assessment" });
  }
};

export const submitAssessmentAttempt = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const assessmentId = Number(req.params.id);
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    if (!assessmentId || !answers.length) {
      return res.status(400).json({ error: "assessment_id and answers are required" });
    }

    await client.query("BEGIN");

    const attempt = await client.query(
      `
      INSERT INTO candidate_attempts (assessment_id, candidate_id, candidate_email, status, total_questions)
      VALUES ($1, $2, $3, 'submitted', $4)
      RETURNING attempt_id
      `,
      [
        assessmentId,
        req.body.candidate_id ? Number(req.body.candidate_id) : null,
        req.body.candidate_email || null,
        answers.length,
      ]
    );

    const questionIds = answers.map((answer: any) => Number(answer.question_id)).filter(Boolean);
    const answerKey = await client.query(
      `
      SELECT q.question_id, q.correct_option
      FROM question_sets qs
      JOIN questions q ON q.question_set_id = qs.question_set_id
      WHERE qs.assessment_id = $1
        AND q.question_id = ANY($2::int[])
      `,
      [assessmentId, questionIds]
    );

    const correctByQuestionId = new Map<number, string>(
      answerKey.rows.map((row: any) => [Number(row.question_id), String(row.correct_option)])
    );

    let correctCount = 0;
    for (const answer of answers) {
      const questionId = Number(answer.question_id);
      const selected = normalizeCorrectOption(answer.selected_option);
      const isCorrect = correctByQuestionId.get(questionId) === selected;
      if (isCorrect) correctCount += 1;

      await client.query(
        `
        INSERT INTO candidate_answers (attempt_id, question_id, selected_option, is_correct)
        VALUES ($1, $2, $3, $4)
        `,
        [attempt.rows[0].attempt_id, questionId, selected, isCorrect]
      );
    }

    const score = Number(((correctCount / answers.length) * 100).toFixed(2));
    await client.query(
      `
      UPDATE candidate_attempts
      SET score = $1, submitted_at = NOW(), total_questions = $2
      WHERE attempt_id = $3
      `,
      [score, answers.length, attempt.rows[0].attempt_id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      data: {
        attempt_id: attempt.rows[0].attempt_id,
        score,
        correct: correctCount,
        total_questions: answers.length,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(400).json({ error: error.message || "Failed to submit assessment" });
  } finally {
    client.release();
  }
};

export const createAssessmentFromAi = async (req: Request, res: Response) => {
  try {
    const count = Math.min(Math.max(Number(req.body.count) || 5, 1), 25);
    const questions = await generateAiQuestions(req.body.role || "", req.body.topic || "", count, req.body.prompt || "");
    const assessment = await createAssessmentWithQuestions(req, {
      title: req.body.title || `${req.body.role || "General"} assessment`,
      description: req.body.description || req.body.prompt || "",
      role: req.body.role || "",
      duration_minutes: req.body.duration_minutes,
      source_type: "ai",
      prompt: req.body.prompt || "",
      questions,
    });

    return res.status(201).json({ success: true, data: assessment, question_count: questions.length });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to generate assessment" });
  }
};

export const createAssessmentFromCsv = async (req: Request, res: Response) => {
  try {
    const csv = String(req.body.csv || "");
    const questions = parseCsvQuestions(csv);
    if (!questions.length) {
      return res.status(400).json({
        error: "CSV needs a header row and at least one question row.",
        expected_headers: "question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,topic,explanation",
      });
    }

    const assessment = await createAssessmentWithQuestions(req, {
      title: req.body.title || "Uploaded assessment",
      description: req.body.description || "",
      role: req.body.role || "",
      duration_minutes: req.body.duration_minutes,
      source_type: "upload",
      source_file: req.body.source_file || "browser-upload.csv",
      questions,
    });

    return res.status(201).json({ success: true, data: assessment, question_count: questions.length });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to import CSV" });
  }
};

export const createAssessmentFromUpload = async (req: Request, res: Response) => {
  try {
    const { fields, file } = await parseMultipartForm(req);
    if (!file) return res.status(400).json({ error: "Please upload a CSV or PDF file." });

    const extension = path.extname(file.filename).toLowerCase();
    const isCsv = extension === ".csv" || file.mimetype.includes("csv");
    const isPdf = extension === ".pdf" || file.mimetype.includes("pdf");

    let questions: NormalizedQuestion[] = [];
    let attemptedQuestions = 0;
    let parser = "";

    if (isCsv) {
      const csv = file.buffer.toString("utf8");
      attemptedQuestions = Math.max(0, csv.split(/\r?\n/).filter(Boolean).length - 1);
      questions = parseCsvQuestions(csv);
      parser = "csv";
    } else if (isPdf) {
      const text = await extractPdfText(file.buffer, file.filename);
      attemptedQuestions = text.match(/(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s+/gi)?.length || 0;
      questions = parsePdfQuestions(text);
      parser = "pdf";
    } else {
      return res.status(400).json({ error: "Only CSV and PDF uploads are supported." });
    }

    if (!questions.length) {
      return res.status(400).json({
        error: isPdf
          ? "No valid PDF questions found. Use numbered questions with A/B/C/D options and an Answer: A line."
          : "CSV needs headers: question_text,option_a,option_b,option_c,option_d,correct_option.",
      });
    }

    const parseAccuracy = attemptedQuestions > 0
      ? Number(((questions.length / attemptedQuestions) * 100).toFixed(2))
      : 100;

    const enrichedQuestions = questions.map((question) => ({
      ...question,
      metadata: {
        ...(question.metadata || {}),
        import_parser: parser,
        import_parse_accuracy: parseAccuracy,
      },
    }));

    const assessment = await createAssessmentWithQuestions(req, {
      title: fields.title || path.basename(file.filename, extension) || "Uploaded assessment",
      description: fields.description || "",
      role: fields.role || "",
      duration_minutes: Number(fields.duration_minutes) || 30,
      source_type: "upload",
      source_file: file.filename,
      questions: enrichedQuestions,
    });

    return res.status(201).json({
      success: true,
      data: assessment,
      question_count: questions.length,
      attempted_questions: attemptedQuestions || questions.length,
      parse_accuracy: parseAccuracy,
      parser,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to upload assessment file" });
  }
};
