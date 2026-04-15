import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Node.js backend routes
      "/api/auth": {
        target: "http://localhost:3003",
        changeOrigin: true,
      },
      "/api/admin": {
        target: "http://localhost:3003",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3003",
        changeOrigin: true,
      },

      // Python AI Worker (FastAPI) routes
      "/api/parse-resume": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
      "/api/parse-resumes-bulk": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
      "/api/match-candidates": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
