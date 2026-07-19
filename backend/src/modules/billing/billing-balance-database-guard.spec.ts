import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('billing balance database guards', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260718234500_billing_business_rules_phase2/migration.sql'),
    'utf8',
  );

  it('serializes request and invoice balance checks per sale document', () => {
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(NEW."saleDocumentId", 0))');
  });

  it('subtracts active invoice applications before accepting a request', () => {
    expect(migration).toMatch(/active_invoiced[\s\S]+i\."status" = 'ACTIVE'/);
    expect(migration).toContain(
      'active_requested + active_invoiced + NEW."requestedTotal" > available_total',
    );
  });

  it('rejects invoice applications above the remaining document balance', () => {
    expect(migration).toContain('active_invoiced + NEW."totalApplied" > available_total');
    expect(migration).toContain("ERRCODE = 'P0001'");
  });
});
