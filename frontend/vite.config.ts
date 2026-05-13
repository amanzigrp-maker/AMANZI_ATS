import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Node.js backend routes
      "/api": {
        target: "http://127.0.0.1:3003",
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
      "lucide-react": path.resolve(__dirname, "./src/lib/icons.tsx"),
    },
  },
}));
