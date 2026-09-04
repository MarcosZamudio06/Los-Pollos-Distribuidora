import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(
  root,
  'prisma/migrations/20260901230000_global_fiscal_folio_sequence/migration.sql',
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : '';
const repositoryPaths = [
  'src/modules/cfdi/cfdi-issuance.repository.ts',
  'src/modules/cfdi/credit-adjustment.repository.ts',
  'src/modules/cfdi/rep-issuance.repository.ts',
];

function model(name: string): string {
  const match = schema.match(
    new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'm'),
  );

  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('global fiscal folio sequence contract', () => {
  it('uses one sequence per legal entity and series while preserving Invoice identity', () => {
    const sequence = model('FiscalFolioSequence');
    const invoice = model('Invoice');

    expect(sequence).toMatch(/@@unique\(\[legalEntityId, series\]\)/);
    expect(sequence).not.toMatch(/cfdiType\s+CfdiDocumentType/);
    expect(invoice).toMatch(/@@unique\(\[legalEntityId, series, folio\]\)/);
  });

  it.each(repositoryPaths)(
    '%s reserves from the global legal-entity/series authority',
    (repositoryPath) => {
      const repository = readFileSync(resolve(root, repositoryPath), 'utf8');

      expect(repository).toContain('legalEntityId_series');
      expect(repository).not.toContain('legalEntityId_cfdiType_series');
    },
  );

  it('consolidates old counters above invoices and reserved values under migration locks', () => {
    expect(migration).toMatch(
      /LOCK TABLE "FiscalFolioSequence" IN ACCESS EXCLUSIVE MODE/,
    );
    expect(migration).toMatch(
      /LOCK TABLE "Invoice" IN SHARE ROW EXCLUSIVE MODE/,
    );
    expect(migration).toMatch(/folio\s*~\s*'\^\[0-9\]\+\$'/);
    expect(migration).toMatch(/MAX\([\s\S]*folio::numeric[\s\S]*\)/);
    expect(migration).toMatch(/MAX\("nextValue"\)/);
    expect(migration).toContain('invoice_rollup."maxInvoiceNumericFolio" + 1');
    expect(migration).toContain('GREATEST(');
    expect(migration).toContain(
      'DROP INDEX "FiscalFolioSequence_legalEntityId_cfdiType_series_key"',
    );
    expect(migration).toContain('DROP COLUMN "cfdiType"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "FiscalFolioSequence_legalEntityId_series_key"',
    );
    expect(migration).not.toMatch(/(?:UPDATE|DELETE FROM)\s+"Invoice"/i);
  });
});
