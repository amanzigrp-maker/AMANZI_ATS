type FrontendEnvironment = "local" | "development" | "test" | "staging" | "production";

const required = (name: string, value: string | undefined, fallback?: string) => {
  if (!value && !fallback) {
    throw new Error(`[CONFIG] Missing required frontend env var: ${name}`);
  }
  return value || fallback || "";
};

const parseEnvironment = (value?: string): FrontendEnvironment => {
  const normalized = (value || "local").toLowerCase();
  if (normalized === "dev") return "development";
  if (["local", "development", "test", "staging", "production"].includes(normalized)) {
    return normalized as FrontendEnvironment;
  }
  return "local";
};

const parseUrl = (name: string, value: string) => {
  if (value === "") return "";
  if (value.startsWith("/")) {
    return value.replace(/\/$/, "");
  }
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`[CONFIG] ${name} must be a valid URL`);
  }
};

const env = import.meta.env;
const appEnv = parseEnvironment(env.VITE_APP_ENV || env.MODE);
const localApiFallback = appEnv === "local" || appEnv === "development" ? "http://localhost:3003" : undefined;

export const frontendConfig = Object.freeze({
  appEnv,
  appName: env.VITE_APP_NAME || "Amanzi ATS",
  apiBaseUrl: parseUrl("VITE_API_BASE_URL", required("VITE_API_BASE_URL", env.VITE_API_BASE_URL, localApiFallback)),
  pythonWorkerBaseUrl: parseUrl(
    "VITE_PYTHON_WORKER_BASE_URL",
    env.VITE_PYTHON_WORKER_BASE_URL || "http://localhost:8001"
  ),
  secureBrowserRequired: env.VITE_SECURE_BROWSER_REQUIRED === "true",
  sentryDsn: env.VITE_SENTRY_DSN,
});

export type FrontendConfig = typeof frontendConfig;
