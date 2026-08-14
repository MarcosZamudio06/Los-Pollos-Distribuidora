import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  BUNDLE_BUDGET_KB,
  createBundleBudgetPlugin,
} from "./src/app/bundleBudget.ts";

const apiProxyTarget =
  process.env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:4000";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: BUNDLE_BUDGET_KB.entry,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("/src/features/auth/AuthProvider.") ||
            id.includes("/src/features/auth/authApi.") ||
            id.includes("/src/features/auth/authContext.") ||
            id.includes("/src/features/auth/useAuth.") ||
            id.includes("/src/features/auth/permissions.") ||
            id.includes("/src/features/auth/types.") ||
            id.includes("/src/features/auth/routes/")
          ) {
            return "auth-runtime";
          }
          return undefined;
        },
      },
    },
  },
  plugins: [react(), tailwindcss(), createBundleBudgetPlugin()],
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
