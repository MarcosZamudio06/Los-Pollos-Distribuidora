import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('billing phase 9 reconciliation contract', () => {
  const reconciliation = readFileSync(
    resolve(
      process.cwd(),
      'prisma/scripts/billing-phase9-reconciliation.sql',
    ),
    'utf8',
  );

  it('reconciles active document applications against sale documents and invoices', () => {
    expect(reconciliation).toContain('documentApplicationTotal');
    expect(reconciliation).toContain('invoiceApplicationTotal');
    expect(reconciliation).toContain(`i."status" = 'ACTIVE'`);
    expect(reconciliation).toContain('isd."reversedAt" IS NULL');
  });

  it('reconciles item applications with their document application', () => {
    expect(reconciliation).toContain('itemApplicationTotal');
    expect(reconciliation).toContain('InvoiceSaleItemApplication');
    expect(reconciliation).toContain('isia."reversedAt" IS NULL');
  });

  it('reconciles sale collection balances without PaymentAllocation', () => {
    expect(reconciliation).toContain('activePaymentTotal');
    expect(reconciliation).toContain('AccountReceivable');
    expect(reconciliation).not.toContain('PaymentAllocation');
  });

  it('compares report rows, summary totals, and export-source totals from one read model', () => {
    expect(reconciliation).toContain('reportRows');
    expect(reconciliation).toContain('reportSummary');
    expect(reconciliation).toContain('exportSource');
    expect(reconciliation).toContain('parityStatus');
  });
});
