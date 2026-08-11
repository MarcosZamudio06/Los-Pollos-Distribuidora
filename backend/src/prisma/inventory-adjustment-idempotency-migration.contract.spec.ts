import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260810173000_add_inventory_adjustment_idempotency/migration.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('inventory adjustment idempotency migration', () => {
  it('persists a unique key and payload hash on inventory movements', () => {
    expect(migration).toContain('ADD COLUMN "idempotencyKey" TEXT');
    expect(migration).toContain('ADD COLUMN "idempotencyPayloadHash" TEXT');
    expect(migration).toContain('InventoryMovement_idempotencyKey_key');
  });
});
