import React from "react";

type Segment =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language?: string };

const codeLinePattern =
  /^\s*(const |let |var |function |class |if\s*\(|else\b|for\s*\(|while\s*\(|return\b|import |export |SELECT\b|FROM\b|WHERE\b|INSERT\b|UPDATE\b|DELETE\b|CREATE\b|<\w+|[\w$]+\s*=>|[#@].*include|public |private |async |await |def |print\(|console\.log|{\s*$|}\s*$)/i;

const looksLikeCodeLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (codeLinePattern.test(trimmed)) return true;
  const symbolHits = ["{", "}", ";", "=>", "==", "!=", "::", "&&", "||"].filter((token) => trimmed.includes(token)).length;
  return symbolHits >= 2;
};

const parseQuestionContent = (value: string): Segment[] => {
  const text = String(value || "").replace(/\r/g, "");
  if (!text.trim()) return [{ type: "text", content: "" }];

  const inlineCodeMatch = text.match(/^([\s\S]*?)\bCode:\s*([\s\S]+)$/i);
  if (inlineCodeMatch) {
    const intro = String(inlineCodeMatch[1] || "").trim();
    const code = String(inlineCodeMatch[2] || "").trim();
    const segments: Segment[] = [];
    if (intro) {
      segments.push({ type: "text", content: intro });
    }
    if (code) {
      segments.push({ type: "code", content: code, language: "code" });
    }
    if (segments.length) {
      return segments;
    }
  }

  const fencedSegments: Segment[] = [];
  const fenceRegex = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) fencedSegments.push({ type: "text", content: before.trim() });
    fencedSegments.push({
      type: "code",
      language: (match[1] || "").trim() || undefined,
      content: String(match[2] || "").replace(/^\n+|\n+$/g, ""),
    });
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex);
  if (tail.trim()) fencedSegments.push({ type: "text", content: tail.trim() });

  if (fencedSegments.some((segment) => segment.type === "code")) {
    return fencedSegments;
  }

  const lines = text.split("\n");
  const parsed: Segment[] = [];
  let textBuffer: string[] = [];
  let codeBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length) {
      parsed.push({ type: "text", content: textBuffer.join("\n").trim() });
      textBuffer = [];
    }
  };

  const flushCode = () => {
    if (codeBuffer.length) {
      parsed.push({ type: "code", content: codeBuffer.join("\n").trimEnd() });
      codeBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const currentLooksLikeCode = looksLikeCodeLine(line);
    const nextLooksLikeCode = i + 1 < lines.length ? looksLikeCodeLine(lines[i + 1]) : false;

    if (currentLooksLikeCode || (line.startsWith("    ") && nextLooksLikeCode)) {
      flushText();
      codeBuffer.push(line);
      continue;
    }

    if (codeBuffer.length >= 2) {
      flushCode();
    } else if (codeBuffer.length === 1) {
      textBuffer.push(codeBuffer[0]);
      codeBuffer = [];
    }

    textBuffer.push(line);
  }

  if (codeBuffer.length >= 2) {
    flushCode();
  } else if (codeBuffer.length === 1) {
    textBuffer.push(codeBuffer[0]);
  }

  flushText();
  return parsed.filter((segment) => segment.content.trim());
};

const CodePanel = ({ code, language, compact = false }: { code: string; language?: string; compact?: boolean }) => (
  <div className={`overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 ${compact ? "mt-2" : "mt-4"}`}>
    <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        {language || "code"}
      </span>
    </div>
    <pre className={`overflow-x-auto whitespace-pre-wrap p-4 font-mono text-slate-100 ${compact ? "text-xs leading-5" : "text-sm leading-6"}`}>
      <code>{code}</code>
    </pre>
  </div>
);

export default function QuestionContent({
  content,
  className = "",
  compact = false,
}: {
  content: string;
  className?: string;
  compact?: boolean;
}) {
  const segments = parseQuestionContent(content);

  return (
    <div className={className}>
      {segments.map((segment, index) =>
        segment.type === "code" ? (
          <CodePanel key={`${segment.type}-${index}`} code={segment.content} language={segment.language} compact={compact} />
        ) : (
          <div
            key={`${segment.type}-${index}`}
            className={`whitespace-pre-wrap ${compact ? "text-sm leading-6" : "text-base leading-7"}`}
          >
            {segment.content}
          </div>
        )
      )}
    </div>
  );
}
