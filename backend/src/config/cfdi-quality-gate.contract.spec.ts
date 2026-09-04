import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(process.cwd(), '..');

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

describe('CFDI quality gate contract', () => {
  it('keeps normal CI provider-disabled and scans fiscal assets', () => {
    const workflow = readRepositoryFile('.github/workflows/quality-gate.yml');

    expect(workflow).toMatch(/CFDI_ENABLED:\s*["']false["']/);
    expect(workflow).toContain('FISCAL_PROVIDER: NONE');
    expect(workflow).toContain('node scripts/validate-fiscal-assets.mjs');
    expect(workflow).not.toMatch(/secrets\.FACTURAMA_/);
  });

  it('keeps the existing backend coverage thresholds unchanged', () => {
    const workflow = readRepositoryFile('.github/workflows/quality-gate.yml');
    const packageJson = JSON.parse(
      readRepositoryFile('backend/package.json'),
    ) as {
      jest: { coverageThreshold: { global: Record<string, number> } };
    };

    expect(packageJson.jest.coverageThreshold.global).toEqual({
      branches: 65,
      functions: 75,
      lines: 80,
      statements: 80,
    });
    expect(workflow).toContain('prisma migrate deploy');
    expect(workflow).toContain('run test:e2e -- --runInBand');
    expect(workflow).toContain('run typecheck');
    expect(workflow).toContain('docker build --file docker/backend/Dockerfile');
    expect(workflow).toContain(
      'docker build --build-arg OBJECT_STORAGE_PUBLIC_ORIGIN=',
    );
  });

  it('isolates real PAC access in a protected manual sandbox workflow', () => {
    const workflow = readRepositoryFile('.github/workflows/cfdi-sandbox.yml');

    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).not.toMatch(/\n\s+(?:push|pull_request|schedule):/);
    expect(workflow).toContain('environment: cfdi-sandbox');
    expect(workflow).toMatch(/CFDI_ENABLED:\s*["']true["']/);
    expect(workflow).toContain('FISCAL_PROVIDER_ENVIRONMENT: SANDBOX');
    expect(workflow).toContain('CFDI_FISCAL_TIME_ZONE: America/Mexico_City');
    expect(workflow).toContain('https://apisandbox.facturama.mx');
    expect(workflow).not.toContain('FISCAL_PROVIDER_ENVIRONMENT: PRODUCTION');
    expect(workflow).not.toContain('https://api.facturama.mx');
    expect(workflow).toMatch(/secrets\.FACTURAMA_SANDBOX_/);
    expect(workflow).toContain('contract:');
    expect(workflow).toContain("if: ${{ inputs.contract == 'stamp' }}");
    expect(workflow).toContain('RUN_FACTURAMA_SANDBOX_STAMP: "true"');
    expect(workflow).toContain('jest-facturama-sandbox-stamp.json');
    expect(workflow).toContain('FACTURAMA_SANDBOX_ISSUER_RFC');
  });
});
