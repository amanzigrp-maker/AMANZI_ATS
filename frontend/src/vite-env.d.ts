/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: "local" | "development" | "test" | "staging" | "production";
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PYTHON_WORKER_BASE_URL?: string;
  readonly VITE_SECURE_BROWSER_REQUIRED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?worker' {
  const content: any;
  export default content;
}
