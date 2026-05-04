const normalizedLogLevel = String(process.env.APP_LOG_LEVEL || process.env.LOG_LEVEL || 'warn').toLowerCase();

const levelOrder: Record<string, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const currentLevel = levelOrder[normalizedLogLevel] ?? levelOrder.warn;

export const shouldLog = (level: 'error' | 'warn' | 'info' | 'debug') => {
  return currentLevel >= levelOrder[level];
};

export const logDebug = (...args: any[]) => {
  if (shouldLog('debug')) console.log(...args);
};

export const logInfo = (...args: any[]) => {
  if (shouldLog('info')) console.log(...args);
};

export const logWarn = (...args: any[]) => {
  if (shouldLog('warn')) console.warn(...args);
};

export const shouldShowSensitiveDevLogs = () =>
  String(process.env.LOG_SENSITIVE_DEV_DETAILS || '').toLowerCase() === 'true';

export const maskEmail = (value?: string | null) => {
  const email = String(value || '').trim();
  const at = email.indexOf('@');
  if (at <= 1) return email ? '[redacted-email]' : '';
  return `${email.slice(0, 2)}***${email.slice(at)}`;
};

export const maskSecret = (label: string) => `${label}: [redacted]`;

const noisyMessagePatterns = [
  /new client connected/i,
  /client disconnected/i,
  /joined room interview/i,
  /proctor event:/i,
  /signaling from/i,
  /\[python\].*\binfo\b/i,
  /\[python\].*\bsuccess\b/i,
  /\[python\].*application startup complete/i,
  /\[python\].*uvicorn running on/i,
  /\[python\].*get \/health/i,
  /adaptive selection:/i,
  /adaptive fallback:/i,
  /adaptive ai question/i,
  /irt update/i,
  /vendor apply request user object/i,
  /vendor apply debug/i,
  /duplicate check/i,
  /application inserted/i,
  /fetching applications:/i,
  /found applications:/i,
  /checking eligibility:/i,
  /audit data:/i,
  /attempted email:/i,
  /\[dev mode\]/i,
  /\[dev email\]/i,
];

const redactString = (value: string) =>
  value
    .replace(/(password|otp|token|login url)\s*:\s*[^\s]+/gi, (_, key) => `${key}: [redacted]`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]');

const serializeArg = (arg: any) => {
  if (typeof arg === 'string') return redactString(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (arg && typeof arg === 'object') {
    try {
      return JSON.stringify(arg, (key, value) => {
        if (/password|otp|token|authorization|cookie|loginurl|jwt|email|phone/i.test(key)) {
          return '[redacted]';
        }
        return value;
      });
    } catch {
      return '[object]';
    }
  }
  return arg;
};

export const installConsoleFilters = () => {
  const originalLog = console.log.bind(console);
  const originalInfo = console.info.bind(console);
  const originalWarn = console.warn.bind(console);

  const wrap = (
    original: (...args: any[]) => void,
    level: 'info' | 'warn' | 'debug'
  ) => (...args: any[]) => {
    const rendered = args.map(serializeArg).join(' ');
    if (level !== 'warn' && noisyMessagePatterns.some((pattern) => pattern.test(rendered)) && !shouldLog('debug')) {
      return;
    }
    original(...args.map(serializeArg));
  };

  console.log = wrap(originalLog, 'info');
  console.info = wrap(originalInfo, 'info');
  console.warn = wrap(originalWarn, 'warn');
};
