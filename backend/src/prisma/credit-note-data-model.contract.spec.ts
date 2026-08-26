import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CFDI E credit adjustment persistence contract', () => {
  const schema = readFileSync(
    join(process.cwd(), 'prisma', 'schema.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260824100000_add_cfdi_credit_adjustments',
      'migration.sql',
    ),
    'utf8',
  );

  it('keeps the commercial authorization separate from fiscal Invoice', () => {
    expect(schema).toContain('model CreditAdjustment {');
    expect(schema).toContain('model CreditAdjustmentInvoice {');
    expect(schema).toContain('model CreditAdjustmentLine {');
    expect(schema).toContain('sourceCreditAdjustmentId');
    expect(schema).toMatch(/cfdiType\s+CfdiDocumentType\?/);
  });

  it('adds only fiscal relations and never touches inventory tables', () => {
    expect(migration).toContain('CREATE TABLE "CreditAdjustment"');
    expect(migration).toContain('CREATE TABLE "CreditAdjustmentInvoice"');
    expect(migration).toContain('CREATE TABLE "CreditAdjustmentLine"');
    expect(migration).not.toMatch(/UPDATE\s+"Inventory/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"InventoryMovement"/i);
  });

  it('protects one fiscal root per commercial adjustment', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "Invoice_sourceCreditAdjustmentId_key"',
    );
  });
});
