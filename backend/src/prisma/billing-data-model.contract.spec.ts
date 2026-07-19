import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20260718230000_billing_reportable_notes_phase1/migration.sql',
  ),
  'utf8',
);

function model(name: string): string {
  const match = schema.match(new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('billing reportable notes phase 1 data contract', () => {
  it('introduces the external invoice aggregate without PaymentAllocation', () => {
    expect(model('LegalEntity')).toMatch(/taxId\s+String\s+@unique/);
    expect(model('LegalEntityOperationalLocation')).toMatch(/operationalLocationId\s+String/);
    expect(model('Invoice')).toMatch(/status\s+InvoiceStatus/);
    expect(model('Invoice')).toMatch(/uuid\s+String\?\s+@unique/);
    expect(model('Invoice')).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(model('BillingRequestSaleDocument')).toContain('requestedTotal');
    expect(model('InvoiceSaleDocument')).toContain('totalApplied');
    expect(model('InvoiceSaleItemApplication')).toContain('saleItemId');
    expect(schema).not.toMatch(/model\s+PaymentAllocation\s+\{/);
  });

  it('adds currency, issuer, fiscal profile, and historical item totals', () => {
    expect(model('Sale')).toMatch(/currencyCode\s+String\s+@default\("MXN"\)/);
    expect(model('Sale')).toMatch(/legalEntityId\s+String\?/);
    expect(model('Customer')).toContain('fiscalPostalCode');
    expect(model('Customer')).toContain('fiscalRegime');
    expect(model('Customer')).toContain('fiscalUseCode');
    expect(model('SaleItem')).toMatch(/discount\s+Decimal/);
    expect(model('SaleItem')).toMatch(/taxableBase\s+Decimal/);
    expect(model('SaleItem')).toMatch(/tax\s+Decimal/);
    expect(model('SaleItem')).toMatch(/total\s+Decimal/);
  });

  it('expands legacy links and backfills before contracting uniqueness', () => {
    expect(model('BillingRequest')).toMatch(/saleId\s+String\?/);
    expect(model('BillingRequest')).not.toMatch(/saleId\s+String\?\s+@unique/);
    expect(model('AccountReceivable')).not.toMatch(/billingRequestId\s+String\?\s+@unique/);
    expect(migration).toContain('BillingDataRemediation');
    expect(migration).toContain('BACKFILL_MISSING_SALE_DOCUMENT');
    expect(migration).toContain('DROP INDEX "BillingRequest_saleId_key"');
    expect(migration).toContain('DROP INDEX "AccountReceivable_billingRequestId_key"');
    expect(migration).toContain('billing_request_document_amount_guard');
    expect(migration).toContain('invoice_document_amount_guard');
    expect(migration).toContain('invoice_item_application_amount_guard');
  });
});
