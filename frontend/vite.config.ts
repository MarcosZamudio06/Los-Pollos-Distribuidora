import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

const apiProxyTarget =
  process.env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: apiProxyTarget,
        ws: true,
      },
    },
  },
  test: {
    allowOnly: false,
    coverage: {
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 45,
        functions: 45,
        lines: 55,
        statements: 55,
      },
    },
    setupFiles: ["./src/test-setup.ts"],
  },
});
