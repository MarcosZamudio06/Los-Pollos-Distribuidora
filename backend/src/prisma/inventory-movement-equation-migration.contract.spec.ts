import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260810160000_enforce_inventory_movement_equation/migration.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('inventory movement equation migration', () => {
  it('normalizes historical receipt markers without deleting receipt variance evidence', () => {
    expect(migration).toContain('UPDATE "InventoryMovement"');
    expect(migration).toContain('"referenceType" = \'BRANCH_SUPPLY_RECEIPT\'');
    expect(migration).toContain("\"type\" IN ('SHRINKAGE', 'IN')");
    expect(migration).toContain('"quantityKg" = 0');
    expect(migration).toContain('"quantityPieces" = 0');
  });

  it('rejects new positive movement quantities whose balance delta is zero', () => {
    expect(migration).toContain(
      'InventoryMovement_positive_quantity_delta_check',
    );
    expect(migration).toContain('"newQuantityKg" <> "previousQuantityKg"');
    expect(migration).toContain(
      '"newQuantityPieces" <> "previousQuantityPieces"',
    );
    expect(migration).toContain('NOT VALID');
  });
});
