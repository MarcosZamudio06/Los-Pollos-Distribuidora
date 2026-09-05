import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readBrowserEnvironment } from './browser-environment';
import { seedBrowserDatabase } from './browser-seed';

async function main() {
  readBrowserEnvironment();
  if (process.argv.includes('--check')) {
    console.log(
      'Browser disposable-environment guard passed; no database connection or writes',
    );
    return;
  }
  // Explicit preparation, never hidden in a Playwright global setup or test.
  for (const operation of ['deploy', 'status']) {
    const result = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      [
        '--prefix',
        resolve(__dirname, '..'),
        'exec',
        '--',
        'prisma',
        'migrate',
        operation,
        '--schema',
        resolve(__dirname, '../prisma/schema.prisma'),
      ],
      {
        stdio: 'inherit',
        env: process.env,
        // Keep Prisma CLI away from the developer's root/backend .env files.
        cwd: resolve(__dirname, '../../frontend/e2e'),
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `Prisma migrate ${operation} failed; seed was not executed`,
      );
    }
  }
  await seedBrowserDatabase();
}

void main().catch((error: unknown) => {
  // Prisma errors can embed connection details; never print raw errors here.
  console.error(
    error instanceof Error && !error.constructor.name.startsWith('Prisma')
      ? error.message
      : 'Browser database preparation failed',
  );
  process.exitCode = 1;
});
