import { readFileSync } from 'fs';
import { join } from 'path';

describe('credit blocking migration', () => {
  it('guards unknown values, maps legacy mode, casts enum, and adds snapshot columns', () => {
    const sql = readFileSync(join(process.cwd(), 'prisma/migrations/20260718042000_credit_blocking_automation/migration.sql'), 'utf8');

    expect(sql).toContain("NOT IN ('BLOCK', 'BLOCK_NEW_CREDIT', 'WARN_ONLY')");
    expect(sql).toContain("SET \"overdueBlockingMode\" = 'BLOCK_NEW_CREDIT'");
    expect(sql).toContain('TYPE "OverdueBlockingMode"');
    expect(sql).toContain('"creditDecisionSnapshot" JSONB');
    expect(sql).toContain('"creditDecisionEvaluatedAt" TIMESTAMP(3)');
  });
});
