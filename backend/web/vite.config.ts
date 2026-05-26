import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server proxies /api → the FastAPI backend on :8011.
// In prod we'd serve the built /dist from the same FastAPI, so the SPA's
// fetch("/api/...") just works regardless of environment.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Everything the SPA calls on the FastAPI proxy: the /api/* passthrough
      // plus the root-level /health and /export endpoints.
      "/api": { target: "http://localhost:8012", changeOrigin: true },
      "/health": { target: "http://localhost:8012", changeOrigin: true },
      "/export": { target: "http://localhost:8012", changeOrigin: true },
    },
  },
});
