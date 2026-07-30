import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('billing remediation canonical consistency backfill', () => {
  it('opens INVALID_SALE_TOTAL for item equations and every header sum mismatch', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260728234500_backfill_canonical_sale_consistency/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('BOOL_OR');
    expect(migration).toContain('SUM(si."taxableBase")');
    expect(migration).toContain('it."itemSubtotal" <> s."subtotal"');
    expect(migration).toContain('it."itemDiscount" <> s."discount"');
    expect(migration).toContain('it."itemTax" <> s."tax"');
    expect(migration).toContain('it."itemTotal" <> s."total"');
    expect(migration).toContain(
      'it."itemTaxableBase" <> s."subtotal" - s."discount"',
    );
    expect(migration).toContain(
      's."subtotal" - s."discount" + s."tax" <> s."total"',
    );
    expect(migration).toContain(
      'ON CONFLICT ("code", "entityType", "entityId") DO UPDATE',
    );
  });
});
