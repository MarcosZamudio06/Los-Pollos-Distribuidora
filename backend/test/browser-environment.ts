import { assertDisposableE2eEnvironment } from './e2e-environment';

/** Shared by preparation, seed and Playwright, before any process or DB writes. */
export function readBrowserEnvironment() {
  assertDisposableE2eEnvironment();
  const databaseUrl = process.env.DATABASE_URL!.trim();
  const database = new URL(databaseUrl);
  if (
    !['postgresql:', 'postgres:'].includes(database.protocol) ||
    database.search ||
    database.hash ||
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !/^\/pollos_browser_e2e(?:_[a-z0-9_]+)?$/.test(database.pathname)
  ) {
    throw new Error(
      'Browser E2E requires a loopback PostgreSQL database named pollos_browser_e2e[_suffix]',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Browser E2E refuses NODE_ENV=production');
  }
  if (
    process.env.CFDI_ENABLED !== 'false' ||
    process.env.FISCAL_PROVIDER !== 'NONE'
  ) {
    throw new Error(
      'Browser E2E requires CFDI_ENABLED=false and FISCAL_PROVIDER=NONE',
    );
  }
  const runId = process.env.E2E_RUN_ID ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(runId)) {
    throw new Error(
      'E2E_RUN_ID must contain 1-40 lowercase letters, digits or hyphens',
    );
  }
  const email = process.env.E2E_ADMIN_EMAIL;
  if (email !== `browser-${runId}@example.test`) {
    throw new Error(
      'E2E_ADMIN_EMAIL must be browser-${E2E_RUN_ID}@example.test',
    );
  }
  const password = process.env.E2E_ADMIN_PASSWORD ?? '';
  if (password.length < 16) {
    throw new Error(
      'E2E_ADMIN_PASSWORD must be a dedicated test password of at least 16 characters',
    );
  }
  const base = new URL(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173');
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    !base.port ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  ) {
    throw new Error(
      'E2E_BASE_URL must be http://127.0.0.1:<port> without a path',
    );
  }
  const backendPort = process.env.E2E_BACKEND_PORT ?? '4100';
  if (
    !/^\d+$/.test(backendPort) ||
    Number(backendPort) < 1024 ||
    Number(backendPort) > 65535 ||
    Number(backendPort) === Number(base.port)
  ) {
    throw new Error(
      'E2E_BACKEND_PORT must be a distinct unprivileged TCP port',
    );
  }
  return {
    databaseUrl,
    runId,
    email,
    password,
    baseURL: base.origin,
    frontendPort: base.port,
    backendPort,
    backendURL: `http://127.0.0.1:${backendPort}`,
  };
}
