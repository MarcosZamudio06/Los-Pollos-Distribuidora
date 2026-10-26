import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Rem003Harness, proof } from './erp-rem003-harness';

describe('Remediation003 readback in a new Node/Nest process after resistance', () => {
  const h = new Rem003Harness();
  beforeAll(async () => h.boot(), 120000);
  afterAll(async () => h.close());
  it('preserves the exact balances, money, receivables, sales and closed snapshots without reseeding', async () => {
    if (!process.env.REM003_EVIDENCE_DIR)
      throw new Error('Resistance proof directory required');
    const before = JSON.parse(
      readFileSync(
        resolve(process.env.REM003_EVIDENCE_DIR, 'resistance-final-data.json'),
        'utf8',
      ),
    ) as {
      balances: Array<{ productId: string }>;
      sales: Array<{ id: string }>;
      settlements: Array<{ id: string }>;
    };
    const ids = before.balances.map((x) => x.productId),
      saleIds = before.sales.map((x) => x.id);
    const after = {
      balances: await h.prisma.inventoryBalance.findMany({
        where: { productId: { in: ids } },
        orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
      }),
      sales: await h.prisma.sale.findMany({
        where: { id: { in: saleIds } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          status: true,
          total: true,
          locationId: true,
          routeId: true,
        },
      }),
      payments: await h.prisma.payment.findMany({
        where: { saleId: { in: saleIds } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          status: true,
          amount: true,
          paidAt: true,
          paymentMethod: true,
        },
      }),
      receivables: await h.prisma.accountReceivable.findMany({
        where: { saleId: { in: saleIds } },
        orderBy: { id: 'asc' },
        select: { id: true, outstandingAmount: true, status: true },
      }),
      settlements: await h.prisma.routeSettlement.findMany({
        where: { id: { in: before.settlements.map((x) => x.id) } },
        orderBy: { id: 'asc' },
      }),
    };
    expect(JSON.parse(JSON.stringify(after)) as unknown).toEqual(before);
    proof('new-process-persistence', {
      pid: process.pid,
      reseeded: false,
      snapshotIdentical: true,
      sales: after.sales.length,
      payments: after.payments.length,
      settlements: after.settlements.length,
    });
  });
});
