import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import dotenv from "dotenv";

export default defineConfig(({ mode }) => {
  const appEnv = process.env.VITE_APP_ENV || process.env.APP_ENV || mode || "local";
  dotenv.config({ path: path.resolve(__dirname, "..", "env", `frontend.${appEnv}.env`), override: true });
  const env = { ...loadEnv(mode, path.resolve(__dirname, ".."), ""), ...process.env };
  const backendTarget = env.VITE_DEV_PROXY_BACKEND_URL || env.VITE_API_BASE_URL || "http://127.0.0.1:3003";
  const workerTarget = env.VITE_DEV_PROXY_PYTHON_WORKER_URL || env.VITE_PYTHON_WORKER_BASE_URL || "http://localhost:8001";

  return {
    envDir: path.resolve(__dirname, ".."),
    server: {
      host: env.VITE_DEV_HOST || "::",
      port: Number(env.VITE_DEV_PORT || 8080),
      proxy: {
        // Node.js backend routes
        "/api": {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
          },
        },

        // Python AI Worker (FastAPI) routes
        "/api/parse-resume": {
          target: workerTarget,
          changeOrigin: true,
        },
        "/api/parse-resumes-bulk": {
          target: workerTarget,
          changeOrigin: true,
        },
        "/api/match-candidates": {
          target: workerTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "lucide-react": path.resolve(__dirname, "./src/lib/icons.tsx"),
      },
    },
  };
});
