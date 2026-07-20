import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('prisma/migrations/20260719053000_canonical_billability_read_model/migration.sql');
const evaluator = read('src/modules/billing/billability-evaluator.ts');
const reportService = read('src/modules/billing/billing-report.service.ts');
const commandService = read('src/modules/billing-requests/billing-requests.service.ts');

describe('canonical billability read model contract', () => {
  it('is the only runtime rule tree used by reports and billing commands', () => {
    expect(migration).toContain('CREATE VIEW "BillingReportableNoteReadModel"');
    expect(reportService).toContain('FROM "BillingReportableNoteReadModel"');
    expect(commandService).toContain('FROM "BillingReportableNoteReadModel"');
    expect(reportService).not.toContain("WHEN s.\"status\" = 'CANCELLED'");
  });

  it('keeps every TypeScript evaluator blocking code represented in SQL', () => {
    const evaluatorCodes = [...evaluator.matchAll(/blockingCodes\.push\([^']*'([A-Z_]+)'/g)].map((match) => match[1]);
    expect(evaluatorCodes.length).toBeGreaterThan(0);
    for (const code of new Set(evaluatorCodes)) expect(migration).toContain(`'${code}'`);
  });

  it('keeps all derived statuses represented in the SQL read model', () => {
    for (const status of ['NOT_BILLABLE', 'BILLABLE', 'PENDING_INFORMATION', 'REQUESTED', 'IN_PROCESS', 'PARTIALLY_INVOICED', 'FULLY_INVOICED', 'BLOCKED', 'CANCELLED']) {
      expect(migration).toContain(`'${status}'`);
    }
  });

  it('uses the same persisted policy and local-calendar deadline semantics', () => {
    for (const field of ['billableDocumentTypes', 'allowInternalReceipt', 'requireConfirmedDelivery', 'deadlineDays', 'deadlineBasis', 'timezone']) {
      expect(migration).toContain(`bp."${field}"`);
    }
    expect(migration).toContain('CURRENT_TIMESTAMP AT TIME ZONE bp."timezone"');
  });

  it('aggregates only active, non-reversed invoice references', () => {
    const uuidAggregate = migration.match(/STRING_AGG\(DISTINCT i\."uuid"[\s\S]+?AS "invoiceUuids"/)?.[0] ?? '';
    const folioAggregate = migration.match(/STRING_AGG\(DISTINCT CONCAT_WS[\s\S]+?AS "invoiceFolios"/)?.[0] ?? '';
    for (const aggregate of [uuidAggregate, folioAggregate]) {
      expect(aggregate).toContain('ix."reversedAt" IS NULL');
      expect(aggregate).toContain('i."status" = \'ACTIVE\'');
    }
  });
});
