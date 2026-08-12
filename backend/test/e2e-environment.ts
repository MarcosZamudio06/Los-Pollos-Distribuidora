/**
 * The E2E corpus mutates inventory, money, and append-only audit records.
 * Refuse to run unless the caller explicitly identifies the same disposable
 * database for the application and the test process.
 */
export function assertDisposableE2eEnvironment(): void {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim();

  if (!databaseUrl || !e2eDatabaseUrl) {
    throw new Error(
      'E2E requires DATABASE_URL and E2E_DATABASE_URL for a disposable database',
    );
  }

  if (databaseUrl !== e2eDatabaseUrl) {
    throw new Error(
      'E2E requires DATABASE_URL to equal E2E_DATABASE_URL; refusing a split database run',
    );
  }

  if (process.env.E2E_DATABASE_DISPOSABLE !== 'true') {
    throw new Error(
      'E2E_DATABASE_DISPOSABLE=true is required because the suite writes append-only records',
    );
  }

  try {
    const parsed = new URL(databaseUrl);
    if (!parsed.pathname || parsed.pathname === '/') {
      throw new Error('missing database name');
    }
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid PostgreSQL URL');
  }
}
