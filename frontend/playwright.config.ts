import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { readBrowserEnvironment } from "../backend/test/browser-environment";

const env = readBrowserEnvironment();
const frontendDirectory = fileURLToPath(new URL(".", import.meta.url));
const testDirectory = fileURLToPath(new URL("./e2e", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  maxFailures: 1,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results/browser",
  use: {
    baseURL: env.baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "NestJS (real PostgreSQL)",
      // A fresh cwd prevents loading the developer's root/backend .env.
      cwd: testDirectory,
      command: "node ../../backend/dist/backend/src/main.js",
      url: `${env.backendURL}/api/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      env: {
        NODE_ENV: "test",
        DATABASE_URL: env.databaseUrl,
        E2E_DATABASE_URL: env.databaseUrl,
        E2E_DATABASE_DISPOSABLE: "true",
        PORT: env.backendPort,
        CORS_ORIGIN: env.baseURL,
        JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
        JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
        CFDI_ENABLED: "false",
        FISCAL_PROVIDER: "NONE",
      },
    },
    {
      name: "Vite (real API proxy)",
      cwd: frontendDirectory,
      command: `npm run dev -- --config vite.browser.config.ts --host 127.0.0.1 --port ${env.frontendPort} --strictPort`,
      url: `${env.baseURL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      env: {
        VITE_API_BASE_URL: "/api",
        VITE_DEV_API_PROXY_TARGET: env.backendURL,
      },
    },
  ],
});
