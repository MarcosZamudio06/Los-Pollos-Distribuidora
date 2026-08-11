import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260810210000_detect_unallocated_sale_item_amounts/migration.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('sale item allocation remediation migration', () => {
  it('queues every sale whose item equations or monetary sums do not reconcile', () => {
    expect(migration).toContain('INSERT INTO "BillingDataRemediation"');
    expect(migration).toContain("'UNALLOCATED_ITEM_AMOUNTS'");
    expect(migration).toContain('"taxableBase" <> "subtotal" - "discount"');
    expect(migration).toContain(
      'item_totals."taxableBase" <> s."subtotal" - s."discount"',
    );
    expect(migration).toContain('item_totals."total" <> s."total"');
  });

  it('records remediation without silently rewriting sale history', () => {
    expect(migration).toContain(
      'ON CONFLICT ("code", "entityType", "entityId") DO NOTHING',
    );
    expect(migration).not.toContain('UPDATE "Sale"');
    expect(migration).not.toContain('UPDATE "SaleItem"');
  });
});
