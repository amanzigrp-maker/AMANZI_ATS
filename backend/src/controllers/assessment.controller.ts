import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import mammoth from "mammoth";
import { pool } from "../lib/database";
import { aiWorkerService } from "../services/ai-worker.service";

type NormalizedQuestion = {
  question_text: string;
  options: Record<string, string>;
  correct_option: string;
  difficulty?: string;
  topic?: string;
  explanation?: string;
  metadata?: Record<string, unknown>;
};

const optionKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "1", "2", "3", "4", "5", "6", "7", "8"] as const;

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

const parseCsvRows = (csv: string): string[][] => {
  const rows: string[][] = [];
  const normalized = String(csv || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      currentCell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const normalizeCorrectOption = (value: unknown): string => {
  return String(value || "").trim().toUpperCase();
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
  const options: Record<string, string> = {};
  
  if (typeof question.options === "object" && question.options && !Array.isArray(question.options)) {
    Object.entries(question.options).forEach(([k, v]) => {
      options[String(k).toUpperCase()] = String(v).trim();
    });
  } else if (Array.isArray(question.options)) {
    question.options.forEach((opt: any, idx: number) => {
      const key = String.fromCharCode(65 + idx);
      options[key] = String(opt).trim();
    });
  } else {
    // Fallback to legacy fields
    if (question.option_a || question.A) options.A = String(question.option_a || question.A).trim();
    if (question.option_b || question.B) options.B = String(question.option_b || question.B).trim();
    if (question.option_c || question.C) options.C = String(question.option_c || question.C).trim();
    if (question.option_d || question.D) options.D = String(question.option_d || question.D).trim();
    if (question.option_e || question.E) options.E = String(question.option_e || question.E).trim();
  }

  const normalized: NormalizedQuestion = {
    question_text: String(question.question_text || question.question || "").trim(),
    options,
    correct_option: normalizeCorrectOption(question.correct_option || question.correct_answer),
    difficulty: String(question.difficulty || "medium").trim().toLowerCase(),
    topic: String(question.topic || "").trim(),
    explanation: String(question.explanation || "").trim(),
    metadata: typeof question.metadata === "object" && question.metadata ? question.metadata : {},
  };

  if (!normalized.question_text || Object.keys(normalized.options).length < 2) {
    throw new Error("Each question needs text and at least two options.");
  }

  return normalized;
};

const parseCsvQuestions = (csv: string): NormalizedQuestion[] => {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());

  return rows.slice(1).map((cells) => {
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
    await new Promise<void>((resolve) => {
      execFile(command, ["-layout", inputPath, outputPath], (error) => {
        // Some pdftotext versions return exit code 1 for minor warnings
        // We resolve anyway and check if the output file was created
        resolve();
      });
    });
    
    if (await fs.access(outputPath).then(() => true).catch(() => false)) {
      const text = await fs.readFile(outputPath, "utf8");
      if (text.trim()) return text;
    }
    return "";
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const extractTextWithPython = async (buffer: Buffer, filename: string): Promise<string> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amanzi-assessment-py-"));
  const safeName = path.basename(filename || "assessment.bin").replace(/[^\w.-]/g, "_");
  const inputPath = path.join(tempDir, safeName);
  const scriptPath = path.join(tempDir, "extract_assessment_text.py");
  const outputPath = path.join(tempDir, "output.txt");
  const pythonPath = process.env.AMANZI_PYTHON_PATH || path.join(process.cwd(), "..", ".venv", "Scripts", "python.exe");

  const script = `
import sys
from pathlib import Path

input_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
suffix = input_path.suffix.lower()
text = ""

def try_pdf():
    import fitz
    doc = fitz.open(str(input_path))
    parts = []
    try:
        for page in doc:
            page_text = (page.get_text("text") or "").strip()
            if page_text:
                parts.append(page_text)
        return "\\n\\n".join(parts).strip()
    finally:
        doc.close()

if suffix == ".pdf":
    try:
        text = try_pdf()
    except Exception:
        text = ""
    if len(text.strip()) < 80:
        try:
            import fitz
            import cv2
            import numpy as np
            import pytesseract
            doc = fitz.open(str(input_path))
            parts = []
            try:
                for page in doc:
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img_data = pix.tobytes("png")
                    nparr = np.frombuffer(img_data, np.uint8)
                    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
                    parts.append(pytesseract.image_to_string(thresh, lang="eng"))
                text = "\\n\\n".join(parts).strip()
            finally:
                doc.close()
        except Exception:
            pass
elif suffix == ".docx":
    try:
        from docx import Document
        doc = Document(str(input_path))
        text = "\\n".join([p.text for p in doc.paragraphs if p.text and p.text.strip()]).strip()
    except Exception:
        text = ""
else:
    try:
        text = input_path.read_text(encoding="utf-8", errors="ignore").strip()
    except Exception:
        text = ""

output_path.write_text(text, encoding="utf-8")
`;

  try {
    await fs.writeFile(inputPath, buffer);
    await fs.writeFile(scriptPath, script);
    await new Promise<void>((resolve, reject) => {
      execFile(pythonPath, [scriptPath, inputPath, outputPath], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return await fs.readFile(outputPath, "utf8");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const extractDocxText = async (buffer: Buffer): Promise<string> => {
  const result = await mammoth.extractRawText({ buffer });
  return String(result.value || "").replace(/\r/g, "").trim();
};

const extractPlainText = (buffer: Buffer): string =>
  buffer
    .toString("utf8")
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "")
    .trim();

const cleanQuestionImportText = (text: string): string =>
  text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/^\s*page \d+(?: of \d+)?\s*$/gim, "")
    .replace(/^\s*ATS .*$/gim, "")
    .replace(/^\s*Full-Stack Development Question Bank.*$/gim, "")
    .replace(/^\s*Original exam-style MCQs.*$/gim, "")
    .replace(/\(Correct\)/gi, " ") // Remove (Correct) suffix if it exists inline
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const splitQuestionAndAnswerKey = (text: string) => {
  const normalized = cleanQuestionImportText(text);
  const headingMatch = normalized.match(/(?:^|\n)\s*Answer\s+Key\s*(?:\n|$)/i);

  if (!headingMatch || headingMatch.index === undefined) {
    return {
      questionText: normalized,
      answerKeyText: "",
    };
  }

  const start = headingMatch.index;
  return {
    questionText: normalized.slice(0, start).trim(),
    answerKeyText: normalized.slice(start).trim(),
  };
};

const extractAnswerKeyMap = (answerKeyText: string) => {
  const map = new Map<number, "A" | "B" | "C" | "D">();
  if (!answerKeyText.trim()) return map;

  const text = cleanQuestionImportText(answerKeyText)
    .replace(/\bQuestion\s+No\.?\b/gi, "Q")
    .replace(/\bAns(?:wer)?\b/gi, " Ans ")
    .replace(/\bQuestion\s+Name\b/gi, " ")
    .replace(/[|]/g, " ");

  const patterns = [
    /\bQ?\s*0*(\d{1,4})\s+(?:[A-Z][^\n]{0,80}\s+)?([A-H1-8])\b/gi,
    /\b(\d{1,4})\s*[.):-]?\s*([A-H1-8])\b/gi,
    /\b(\d{1,4})\b\s*([A-H1-8])\b/gi,
    /\bQ?(\d{1,4})[.):-]\s*([A-H1-8])\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const questionNumber = Number(match[1]);
      const answer = String(match[2] || "").toUpperCase();
      if (questionNumber > 0 && !map.has(questionNumber)) {
        map.set(questionNumber, answer as any);
      }
    }
  }

  return map;
};

const parseQuestionBlocks = (text: string) => {
  const lines = cleanQuestionImportText(text).split("\n");
  const blocks: { number: number; raw: string }[] = [];
  let currentNumber = 0;
  let currentLines: string[] = [];

  const flush = () => {
    if ((currentNumber > 0 || currentLines.some(l => l.includes("?"))) && currentLines.length) {
      blocks.push({ number: currentNumber, raw: currentLines.join("\n").trim() });
    }
    currentNumber = 0;
    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentNumber > 0 || currentLines.length > 0) currentLines.push("");
      continue;
    }

    // Matches "1.", "Q1.", "Question 1:", "1)", "(1)"
    const match = trimmed.match(/^(?:(?:Q(?:uestion)?\s*)?\(?(\d{1,4})\)?[\).:-]\s*|(\d{1,4})\.\s+)(.*)$/i);
    
    let isNewQuestion = false;
    if (match) {
      const num = Number(match[1] || match[2]);
      const textAfter = String(match[3] || "").trim();
      
      // Heuristics to distinguish Question N from Option N
      const nextLine = (lines[i + 1] || "").trim();
      const nextIsOption1 = nextLine.match(/^[1A][\).:-]/i);
      const endsWithQuestionMark = textAfter.endsWith("?") || trimmed.endsWith("?");
      
      if (num !== currentNumber) {
        // If it's the next logical question number, or ends in ?, or is followed by an option start
        if (num === blocks.length + 1 || endsWithQuestionMark || nextIsOption1) {
          isNewQuestion = true;
        }
      }
    }

    // Fuzzy match for unnumbered questions: a line ending in '?' or a short line followed by A-D) or 1)
    const isFuzzyQuestion = !match && trimmed.length > 5 && (
      trimmed.endsWith("?") || 
      (i < lines.length - 1 && lines[i+1].trim().match(/^[A-D1][\).:-]/i))
    );

    if (isNewQuestion || (isFuzzyQuestion && currentLines.length === 0)) {
      flush();
      currentNumber = match ? Number(match[1] || match[2]) : blocks.length + 1;
      const rest = match ? String(match[3] || "").trim() : trimmed;
      if (rest) currentLines.push(rest);
      continue;
    }

    if (currentNumber > 0 || currentLines.length > 0) {
      currentLines.push(trimmed);
    }
  }

  flush();
  return blocks;
};

const extractOptionsFromBlock = (blockText: string) => {
  const patterns = [
    // Matches A) text, B. text, (A) text etc. up to H
    /(?:^|\n|\s)\s*\(?([A-H])\)?[\).:-]?\s+([\s\S]*?)(?=\n\s*\(?[A-H]\)?[\).:-]?\s+|\s+\(?[A-H]\)?[\).:-]?\s+|\n\s*(?:correct\s*)?ans(?:wer)?\s*[:\-]?|\s*$)/gi,
    // Lowercase version a-h
    /(?:^|\n|\s)\s*\(?([a-h])\)?[\).:-]?\s+([\s\S]*?)(?=\n\s*\(?[a-h]\)?[\).:-]?\s+|\s+\(?[a-h]\)?[\).:-]?\s+|\n\s*(?:correct\s*)?ans(?:wer)?\s*[:\-]?|\s*$)/gi,
    // Numeric version 1-8
    /(?:^|\n|\s)\s*\(?([1-8])\)?[\).:-]?\s+([\s\S]*?)(?=\n\s*\(?[1-8]\)?[\).:-]?\s+|\s+\(?[1-8]\)?[\).:-]?\s+|\n\s*(?:correct\s*)?ans(?:wer)?\s*[:\-]?|\s*$)/gi,
  ];

  for (const pattern of patterns) {
    const matches = [...blockText.matchAll(pattern)];
    if (matches.length < 2) continue;

    const deduped = new Map<string, string>();
    for (const match of matches) {
      const key = String(match[1] || "").toUpperCase();
      const value = String(match[2] || "").replace(/\n+/g, " ").trim();
      if (value && !deduped.has(key)) {
        deduped.set(key, value);
      }
    }

    if (deduped.size >= 2) {
      const byKey = Object.fromEntries(deduped);
      return {
        byKey,
        firstIndex: matches[0]?.index || 0,
        count: deduped.size
      };
    }
  }

  return null;
};

const parseInlineAnswerQuestions = (text: string): NormalizedQuestion[] => {
  const { questionText } = splitQuestionAndAnswerKey(text);
  const questions: NormalizedQuestion[] = [];
  
  // Pattern 1: Q text, Answer: A, A) op1 B) op2 ...
  const pattern1 = /(?:^|\n)\s*(\d{1,4})\.\s*([\s\S]*?)\n\s*(?:correct\s*)?ans(?:wer)?\s*[:\-]?\s*\(?([A-D])\)?\s*(?:\n|\s)*A[\).:-]\s*([\s\S]*?)\n\s*B[\).:-]\s*([\s\S]*?)\n\s*C[\).:-]\s*([\s\S]*?)\n\s*D[\).:-]\s*([\s\S]*?)(?=\n\s*\d{1,4}\.\s|\s*$)/gi;
  
  // Pattern 2: Q text, A) op1 B) op2 C) op3 D) op4, Answer: A
  const pattern2 = /(?:^|\n)\s*(\d{1,4})\.\s*([\s\S]*?)\n\s*A[\).:-]\s*([\s\S]*?)\n\s*B[\).:-]\s*([\s\S]*?)\n\s*C[\).:-]\s*([\s\S]*?)\n\s*D[\).:-]\s*([\s\S]*?)\n\s*(?:correct\s*)?ans(?:wer)?\s*[:\-]?\s*\(?([A-D])\)?(?=\n\s*\d{1,4}\.\s|\s*$)/gi;

  const tryMatch = (pattern: RegExp, mapIdx: (m: RegExpMatchArray) => any) => {
    for (const match of questionText.matchAll(pattern)) {
      const q = mapIdx(match);
      try {
        questions.push(validateQuestion({
          ...q,
          difficulty: q.number <= 60 ? "foundation" : q.number <= 130 ? "developing" : q.number <= 195 ? "advanced" : "expert",
          metadata: { source_parser: "inline-regex", pdf_question_number: q.number }
        }));
      } catch {}
    }
  };

  tryMatch(pattern1, m => ({
    number: Number(m[1]),
    question_text: String(m[2]).replace(/\n+/g, " ").trim(),
    correct_option: String(m[3]).toUpperCase(),
    option_a: String(m[4]).replace(/\n+/g, " ").trim(),
    option_b: String(m[5]).replace(/\n+/g, " ").trim(),
    option_c: String(m[6]).replace(/\n+/g, " ").trim(),
    option_d: String(m[7]).replace(/\n+/g, " ").trim(),
  }));

  if (questions.length === 0) {
    tryMatch(pattern2, m => ({
      number: Number(m[1]),
      question_text: String(m[2]).replace(/\n+/g, " ").trim(),
      option_a: String(m[3]).replace(/\n+/g, " ").trim(),
      option_b: String(m[4]).replace(/\n+/g, " ").trim(),
      option_c: String(m[5]).replace(/\n+/g, " ").trim(),
      option_d: String(m[6]).replace(/\n+/g, " ").trim(),
      correct_option: String(m[7]).toUpperCase(),
    }));
  }

  return questions;
};

const parsePdfQuestions = (text: string): NormalizedQuestion[] => {
  const inlineQuestions = parseInlineAnswerQuestions(text);
  if (inlineQuestions.length) return inlineQuestions;

  const { questionText, answerKeyText } = splitQuestionAndAnswerKey(text);
  const answerKey = extractAnswerKeyMap(answerKeyText);
  const blocks = parseQuestionBlocks(questionText);

  const questions: NormalizedQuestion[] = [];

  for (const block of blocks) {
    const questionNumber = Number(block.number || 0);
    const blockText = block.raw;
    const answerMatch = blockText.match(/(?:correct\s*)?ans(?:wer)?\s*[:\-]?\s*\(?([A-H1-8])\)?/i);
    const answerFromKey = questionNumber > 0 ? answerKey.get(questionNumber) : undefined;
    const extractedOptions = extractOptionsFromBlock(blockText);
    if ((!answerMatch && !answerFromKey) || !extractedOptions) continue;

    const firstOptionIndex = extractedOptions.firstIndex;
    const parsedQuestionText = blockText
      .slice(0, firstOptionIndex)
      .trim();

    const byKey: Record<string, string> = extractedOptions.byKey as Record<string, string>;

    const inferredDifficulty =
      questionNumber <= 60 ? "foundation" :
      questionNumber <= 130 ? "developing" :
      questionNumber <= 195 ? "advanced" :
      "expert";

    try {
      const correct_option = answerFromKey || answerMatch?.[1];
      if (!correct_option) continue;

      questions.push(
        validateQuestion({
          question_text: parsedQuestionText,
          options: byKey,
          correct_option: String(correct_option).toUpperCase(),
          difficulty: inferredDifficulty,
          topic: blockText.match(/\bCompetency\s*:\s*([^\n]+)/i)?.[1]?.trim() || "",
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

const parseDocumentQuestions = (text: string): NormalizedQuestion[] => {
  const direct = parsePdfQuestions(text);
  if (direct.length) return direct;

  const flattened = cleanQuestionImportText(text).replace(/\n/g, " \n ");
  return parsePdfQuestions(flattened);
};

const fallbackQuestions = (role: string, topic: string, count: number): NormalizedQuestion[] => {
  const safeRole = role || "candidate";
  const safeTopic = topic || "core skills";
  return Array.from({ length: count }, (_, index) =>
    validateQuestion({
      question_text: `For a ${safeRole}, which approach best demonstrates practical strength in ${safeTopic}?`,
      options: {
        A: "Choose a solution pattern, explain tradeoffs, and validate the outcome.",
        B: "Use the first familiar tool without checking requirements.",
        C: "Avoid documenting assumptions or edge cases.",
        D: "Optimize only for speed and ignore maintainability.",
      },
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
    });

    let retries = 0;
    const maxRetries = 3;
    let lastError: any = null;

    while (retries < maxRetries) {
      try {
        const result = await model.generateContent(`
Generate ${count} recruiter assessment MCQs for role "${role || "General"}" and topic "${topic || "General skills"}".
Recruiter prompt: ${prompt || "Create fair practical screening questions."}

Return only JSON:
{
  "questions": [
    {
      "question_text": "...",
      "options": {
        "A": "...",
        "B": "...",
        "C": "...",
        "D": "..."
      },
      "correct_option": "A",
      "difficulty": "basic|medium|advanced",
      "topic": "...",
      "explanation": "..."
    }
  ]
}

Rules: exactly one correct_option per question (must match a key in options). No markdown.
` );

        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error("❌ AI Response did not contain valid JSON:", text);
          throw new Error("AI returned an invalid question format.");
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : 
                            Array.isArray(parsed) ? parsed : [];
        
        if (rawQuestions.length === 0) {
          console.warn("⚠️ AI returned zero questions. Using fallback.");
          return fallbackQuestions(role, topic, count);
        }

        return rawQuestions.slice(0, count).map(validateQuestion);
      } catch (error: any) {
        lastError = error;
        // If it's a 503 (Service Unavailable/High Demand), retry after a delay
        if (error.status === 503 || error.message?.includes("503") || error.message?.includes("high demand")) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          console.warn(`⚠️ Gemini 503 (High Demand). Retry ${retries}/${maxRetries} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If it's a model not found error, try falling back to gemini-1.5-flash-latest
        if (error.message?.includes("model") && !error.message?.includes("503")) {
           console.log("🔄 Model error detected. Retrying with gemini-1.5-flash-latest...");
           const genAI = new GoogleGenerativeAI(apiKey);
           const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
           const result = await fallbackModel.generateContent(`Generate ${count} MCQs for ${role} on ${topic} as JSON.`);
           const text = (await result.response).text();
           const jsonMatch = text.match(/\{[\s\S]*\}/);
           if (jsonMatch) {
             const parsed = JSON.parse(jsonMatch[0]);
             const qList = Array.isArray(parsed.questions) ? parsed.questions : (Array.isArray(parsed) ? parsed : []);
             if (qList.length > 0) return qList.slice(0, count).map(validateQuestion);
           }
        }
        throw error;
      }
    }
    throw lastError;
  } catch (error: any) {
    console.error("❌ generateAiQuestions final failure:", error);
    throw error;
  }
};

const parseQuestionsWithAi = async (rawText: string): Promise<NormalizedQuestion[]> => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey || rawText.length < 50) return [];

  const tryWithModel = async (modelName: string) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    const prompt = `
      Extract multiple-choice questions (MCQs) from the following raw text. 
      The text might be messy, have weird formatting, or be from a PDF/Word document.
      
      Rules:
      1. Identify each question and all its options.
      2. Identify the correct option for each question.
      3. Return as a JSON object with a "questions" array.

      Format:
      {
        "questions": [
          {
            "question_text": "...",
            "options": {
              "A": "...",
              "B": "...",
              "C": "...",
              "D": "..."
            },
            "correct_option": "A",
            "difficulty": "medium",
            "topic": "...",
            "explanation": "..."
          }
        ]
      }

      Raw Text to Parse:
      ${rawText.slice(0, 15000)}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.questions) ? parsed.questions : [];
  };

  try {
    let rawQuestions = [];
    try {
      rawQuestions = await tryWithModel(process.env.GEMINI_MODEL || "gemini-1.5-flash");
    } catch (e) {
      console.warn("Retrying AI parse with fallback model...");
      rawQuestions = await tryWithModel("gemini-1.5-flash");
    }

    return rawQuestions.map(q => {
      try {
        return validateQuestion(q);
      } catch {
        return null;
      }
    }).filter((q): q is NormalizedQuestion => q !== null);
  } catch (error) {
    console.error("AI parsing failed:", error);
    return [];
  }
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
      for (const [key, text] of Object.entries(question.options)) {
        await client.query(
          `INSERT INTO question_options (question_id, option_key, option_text) VALUES ($1, $2, $3)`,
          [questionId, key, text]
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

const triggerAssessmentEmbedding = (assessmentId: number) => {
  if (!Number.isInteger(assessmentId)) return;
  aiWorkerService.embedAssessment(assessmentId).catch((error) => {
    console.warn(
      `Failed to embed assessment ${assessmentId}:`,
      error instanceof Error ? error.message : error
    );
  });
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

export const deleteAssessment = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Assessment ID is required" });

    const result = await pool.query(`DELETE FROM assessments WHERE assessment_id = $1 RETURNING *`, [id]);
    if (!result.rowCount) return res.status(404).json({ error: "Assessment not found" });

    return res.json({ success: true, message: "Assessment deleted successfully" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to delete assessment" });
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
      INSERT INTO candidate_attempts (assessment_id, candidate_id, candidate_email, status, total_questions, candidate_phone)
      VALUES ($1, $2, $3, 'submitted', $4, $5)
      RETURNING attempt_id
      `,
      [
        assessmentId,
        req.body.candidate_id ? Number(req.body.candidate_id) : null,
        req.body.candidate_email || null,
        answers.length,
        req.body.candidate_phone || null,
      ]
    );

    const questionIds = answers.map((answer: any) => Number(answer.question_id)).filter(Boolean);
    const answerKey = await client.query(
      `
      SELECT q.question_id, q.correct_option, q.question_text,
             jsonb_object_agg(o.option_key, o.option_text ORDER BY o.option_key) AS options
      FROM question_sets qs
      JOIN questions q ON q.question_set_id = qs.question_set_id
      JOIN question_options o ON o.question_id = q.question_id
      WHERE qs.assessment_id = $1
        AND q.question_id = ANY($2::int[])
      GROUP BY q.question_id
      `,
      [assessmentId, questionIds]
    );

    const questionDataMap = new Map<number, { correct: string; text: string; options: any }>(
      answerKey.rows.map((row: any) => [
        Number(row.question_id),
        { correct: String(row.correct_option), text: String(row.question_text), options: row.options }
      ])
    );

    let correctCount = 0;
    for (const answer of answers) {
      const questionId = Number(answer.question_id);
      const selected = normalizeCorrectOption(answer.selected_option);
      const qData = questionDataMap.get(questionId);
      
      const isCorrect = qData?.correct === selected;
      if (isCorrect) correctCount += 1;

      const selectedOptionText = qData?.options?.[selected] || selected;

      await client.query(
        `
        INSERT INTO candidate_answers (attempt_id, question_id, selected_option, is_correct, question_text, selected_option_text)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [attempt.rows[0].attempt_id, questionId, selected, isCorrect, qData?.text || null, selectedOptionText || null]
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

    triggerAssessmentEmbedding(Number(assessment.assessment_id));

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

    triggerAssessmentEmbedding(Number(assessment.assessment_id));

    return res.status(201).json({ success: true, data: assessment, question_count: questions.length });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to import CSV" });
  }
};

export const createAssessmentFromUpload = async (req: Request, res: Response) => {
  try {
    const { fields, file } = await parseMultipartForm(req);
    if (!file) return res.status(400).json({ error: "Please upload a CSV, PDF, DOCX, DOC, or TXT file." });

    const extension = path.extname(file.filename).toLowerCase();
    const isCsv = extension === ".csv" || file.mimetype.includes("csv");
    const isPdf = extension === ".pdf" || file.mimetype.includes("pdf");
    const isDocx = extension === ".docx" || file.mimetype.includes("wordprocessingml");
    const isDoc = extension === ".doc" || file.mimetype.includes("msword");
    const isTxt = extension === ".txt" || file.mimetype.includes("text/plain");

    let questions: NormalizedQuestion[] = [];
    let attemptedQuestions = 0;
    let parser = "";

    if (isCsv) {
      const csv = file.buffer.toString("utf8");
      attemptedQuestions = Math.max(0, csv.split(/\r?\n/).filter(Boolean).length - 1);
      questions = parseCsvQuestions(csv);
      parser = "csv";
    } else if (isPdf) {
      let usedPythonFallback = false;
      let text = "";
      try {
        text = await extractPdfText(file.buffer, file.filename);
      } catch {
        text = "";
      }
      if (!text.trim() || parsePdfQuestions(text).length === 0) {
        const pythonText = await extractTextWithPython(file.buffer, file.filename).catch(() => "");
        if (pythonText.trim()) {
          text = pythonText;
          usedPythonFallback = true;
        }
      }
      attemptedQuestions = text.match(/(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s+/gi)?.length || 0;
      questions = parsePdfQuestions(text);
      parser = usedPythonFallback ? "pdf-python" : "pdf";
    } else if (isDocx) {
      let text = await extractDocxText(file.buffer).catch(() => "");
      let usedPythonFallback = false;
      if (!text.trim()) {
        text = await extractTextWithPython(file.buffer, file.filename).catch(() => "");
        usedPythonFallback = Boolean(text.trim());
      }
      attemptedQuestions = text.match(/(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s+/gi)?.length || 0;
      questions = parseDocumentQuestions(text);
      parser = usedPythonFallback ? "docx-python" : "docx";
    } else if (isDoc || isTxt) {
      let text = extractPlainText(file.buffer);
      let usedPythonFallback = false;
      if (!text.trim()) {
        text = await extractTextWithPython(file.buffer, file.filename).catch(() => "");
        usedPythonFallback = Boolean(text.trim());
      }
      attemptedQuestions = text.match(/(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s+/gi)?.length || 0;
      questions = parseDocumentQuestions(text);
      parser = isDoc ? (usedPythonFallback ? "doc-python" : "doc") : (usedPythonFallback ? "txt-python" : "txt");
    } else {
      return res.status(400).json({ error: "Only CSV, PDF, DOCX, DOC, and TXT uploads are supported." });
    }

    // AI Fallback for "Any Type" of format
    if (questions.length < 2) {
      const allText = (isCsv ? file.buffer.toString("utf8") : await (async () => {
        if (isPdf) {
          const t1 = await extractPdfText(file.buffer, file.filename).catch(() => "");
          if (t1.trim()) return t1;
          return extractTextWithPython(file.buffer, file.filename).catch(() => "");
        }
        if (isDocx) return extractDocxText(file.buffer).catch(() => "");
        return extractPlainText(file.buffer);
      })()) || "";

      if (allText.length > 100) {
        const aiQuestions = await parseQuestionsWithAi(allText);
        if (aiQuestions.length > 0) {
          questions = aiQuestions;
          parser = `${parser}+ai-fallback`;
        }
      }
    }

    if (!questions.length) {
      return res.status(400).json({
        success: false,
        error: "No valid questions found. Use numbered questions with options (e.g. A/B/C/D or 1/2/3/4) and either inline answers or an Answer Key section/table.",
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

    triggerAssessmentEmbedding(Number(assessment.assessment_id));

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
