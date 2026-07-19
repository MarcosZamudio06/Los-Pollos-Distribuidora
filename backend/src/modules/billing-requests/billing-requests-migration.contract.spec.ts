import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('billing requests phase 4 migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260719003000_billing_requests_phase4/migration.sql'),
    'utf8',
  );

  it('persists idempotency, retry lineage and composition history', () => {
    expect(migration).toContain('"creationIdempotencyKey" TEXT');
    expect(migration).toContain('"retryOfBillingRequestId" TEXT');
    expect(migration).toContain('"compositionSnapshot" JSONB');
    expect(migration).toContain('BillingRequest_creationIdempotencyKey_key');
  });
});
