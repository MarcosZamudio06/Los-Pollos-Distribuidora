import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('billing balance database guards', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260718234500_billing_business_rules_phase2/migration.sql'),
    'utf8',
  );

  it('serializes request and invoice balance checks per sale document', () => {
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(NEW."saleDocumentId", 0))');
  });

  it('subtracts active invoice applications before accepting a request', () => {
    expect(migration).toMatch(/active_invoiced[\s\S]+i\."status" = 'ACTIVE'/);
    expect(migration).toContain(
      'active_requested + active_invoiced + NEW."requestedTotal" > available_total',
    );
  });

  it('rejects invoice applications above the remaining document balance', () => {
    expect(migration).toContain('active_invoiced + NEW."totalApplied" > available_total');
    expect(migration).toContain("ERRCODE = 'P0001'");
  });
});

describe('billing request invoice application database guard', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260719023000_link_invoice_application_to_request/migration.sql'),
    'utf8',
  );

  it('serializes and rejects applications above the originating request balance', () => {
    expect(migration).toContain(
      'pg_advisory_xact_lock(hashtextextended(NEW."billingRequestSaleDocumentId", 0))',
    );
    expect(migration).toContain(
      'consumed_total + NEW."totalApplied" > requested_total',
    );
    expect(migration).toContain("MESSAGE = 'OVER_INVOICED'");
  });

  it('requires the application and request relation to reference the same sale document', () => {
    expect(migration).toContain(
      'request_sale_document_id <> NEW."saleDocumentId"',
    );
    expect(migration).toContain("MESSAGE = 'BILLING_REQUEST_DOCUMENT_MISMATCH'");
  });

  it('defers the global invoice equality check until transaction commit', () => {
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER invoice_application_totals_guard_applications');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER invoice_application_totals_guard_invoice');
    expect(migration.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(migration).toContain('applied_subtotal <> invoice_subtotal - invoice_discount');
    expect(migration).toContain('applied_tax <> invoice_tax');
    expect(migration).toContain('applied_total <> invoice_total');
    expect(migration).toContain("MESSAGE = 'INVOICE_TOTAL_MISMATCH'");
  });
});
