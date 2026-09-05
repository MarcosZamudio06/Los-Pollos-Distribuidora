import { readBrowserEnvironment } from './browser-environment';

describe('browser E2E safety boundary (no database connection)', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://postgres:test@127.0.0.1:55432/pollos_browser_e2e',
      E2E_DATABASE_URL:
        'postgresql://postgres:test@127.0.0.1:55432/pollos_browser_e2e',
      E2E_DATABASE_DISPOSABLE: 'true',
      E2E_RUN_ID: 'foundation-001',
      E2E_ADMIN_EMAIL: 'browser-foundation-001@example.test',
      E2E_ADMIN_PASSWORD: 'only-for-disposable-tests-001',
      CFDI_ENABLED: 'false',
      FISCAL_PROVIDER: 'NONE',
    };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts explicit disposable inputs and fixed loopback server defaults', () => {
    expect(readBrowserEnvironment()).toMatchObject({
      runId: 'foundation-001',
      baseURL: 'http://127.0.0.1:4173',
      backendURL: 'http://127.0.0.1:4100',
    });
  });

  it.each([
    'DATABASE_URL',
    'E2E_DATABASE_URL',
    'E2E_DATABASE_DISPOSABLE',
    'E2E_RUN_ID',
    'E2E_ADMIN_EMAIL',
    'E2E_ADMIN_PASSWORD',
  ])('rejects missing %s', (key) => {
    delete process.env[key];
    expect(() => readBrowserEnvironment()).toThrow();
  });

  it.each([
    ['E2E_DATABASE_DISPOSABLE', 'false'],
    ['E2E_DATABASE_URL', 'postgresql://postgres:test@127.0.0.1:55432/other'],
    ['NODE_ENV', 'production'],
    ['CFDI_ENABLED', 'true'],
    ['FISCAL_PROVIDER', 'FACTURAMA'],
    ['E2E_ADMIN_EMAIL', 'admin@company.com'],
    ['E2E_ADMIN_PASSWORD', 'short'],
    ['E2E_RUN_ID', 'unsafe;command'],
    ['E2E_BASE_URL', 'https://erp.example.com'],
    ['E2E_BASE_URL', 'http://127.0.0.1:4173/path'],
    ['E2E_BASE_URL', 'http://localhost:4173'],
    ['E2E_BACKEND_PORT', '4100;echo unsafe'],
    ['E2E_BACKEND_PORT', '4173'],
  ])('rejects unsafe %s=%s', (key, value) => {
    process.env[key] = value;
    expect(() => readBrowserEnvironment()).toThrow();
  });

  it.each([
    'file:///pollos_browser_e2e',
    'postgresql://postgres:test@127.0.0.1:5432/production',
    'postgresql://postgres:test@shared.example.com:5432/pollos_browser_e2e',
    'postgresql://postgres:test@127.0.0.1:5432/pollos_browser_e2e?host=shared.example.com',
  ])('rejects unsafe database targets without connecting', (url) => {
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL = url;
    expect(() => readBrowserEnvironment()).toThrow();
  });
});
