import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260806120000_add_inventory_reservations/migration.sql',
);

describe('inventory reservation migration contract', () => {
  const schema = readFileSync(schemaPath, 'utf8');
  const migration = readFileSync(migrationPath, 'utf8');

  it('declares physical and reserved quantities with availability indexes', () => {
    expect(schema).toMatch(
      /reservedQuantityKg\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(14, 3\)/,
    );
    expect(schema).toMatch(/reservedQuantityPieces\s+Int\s+@default\(0\)/);
    expect(schema).toContain('@@index([locationId, productId])');
    expect(schema).toContain(
      '@@index([productId, locationId, quantityKg, reservedQuantityKg])',
    );
    expect(schema).toContain(
      '@@index([productId, locationId, quantityPieces, reservedQuantityPieces])',
    );
  });

  it('backfills only pending transfer commitments and fails before partial writes', () => {
    expect(migration).toContain(
      'ADD COLUMN "reservedQuantityKg" DECIMAL(14,3) NOT NULL DEFAULT 0',
    );
    expect(migration).toContain(
      'ADD COLUMN "reservedQuantityPieces" INTEGER NOT NULL DEFAULT 0',
    );
    expect(migration).toContain('\'REQUESTED\'::"InventoryTransferStatus"');
    expect(migration).toContain('\'IN_TRANSIT\'::"InventoryTransferStatus"');
    expect(migration).toContain(
      'Inventory reservation migration aborted: origin %',
    );
    expect(migration).toContain(
      'SET\n    "reservedQuantityKg" = pending."reservedQuantityKg"',
    );
  });

  it('enforces non-negative reservations that cannot exceed physical stock', () => {
    expect(migration).toContain(
      'InventoryBalance_reservedQuantityKg_non_negative_check',
    );
    expect(migration).toContain(
      'InventoryBalance_reservedQuantityPieces_non_negative_check',
    );
    expect(migration).toContain('"reservedQuantityKg" <= "quantityKg"');
    expect(migration).toContain('"reservedQuantityPieces" <= "quantityPieces"');
  });
});
