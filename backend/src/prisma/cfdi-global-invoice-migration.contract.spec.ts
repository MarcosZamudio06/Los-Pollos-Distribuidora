import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CFDI global invoice migration contract', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260829220000_add_cfdi_global_information/migration.sql',
    ),
    'utf8',
  );

  it('persists and protects the explicit global information snapshot', () => {
    expect(migration).toContain('"globalInformationSnapshot" JSONB');
    expect(migration).toContain('Invoice_global_information_contract_check');
    expect(migration).toContain("'XAXX010101000'");
    expect(migration).toContain("'PUBLICO EN GENERAL'");
    expect(migration).toContain("'S01'");
    expect(migration).toContain("'PUE'");
    expect(migration).toContain(
      'NEW."globalInformationSnapshot" IS DISTINCT FROM OLD."globalInformationSnapshot"',
    );
  });
});
