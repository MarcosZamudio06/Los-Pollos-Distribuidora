import { Rem003Recovery, snapshotProducts } from './erp-rem003-recovery';
import {
  Rem003Harness,
  data,
  proof,
  type RouteFixture,
} from './erp-rem003-harness';

describe('Remediation003 bounded daily-operation resistance (real PG/S3)', () => {
  const h = new Rem003Harness();
  const seconds = Number(process.env.REM003_RESISTANCE_SECONDS);
  beforeAll(async () => {
    if (!Number.isInteger(seconds) || seconds < 600 || seconds > 3600)
      throw new Error(
        'Explicit REM003_RESISTANCE_SECONDS=600..3600 is required; this is not a unit smoke',
      );
    await h.start();
  }, 120000);
  afterAll(async () => h.close());

  it('completes two concurrent business cycles per minute with verified contract recovery and no unrecovered aborts', async () => {
    const began = performance.now(),
      failures: Array<{ cycle: number; message: string }> = [];
    const completed: Array<{
      cycle: number;
      kind: string;
      productId: string;
      saleId: string;
      settlementId?: string;
      ms: number;
    }> = [];
    const recovery = new Rem003Recovery(h);
    h.commandHandler = (command, send) => recovery.execute(command, send);
    const cycleEvidence: object[] = [];
    async function verifyCycle(
      cycle: number,
      f: RouteFixture,
      returned: boolean,
    ) {
      const sale = await h.prisma.sale.findUniqueOrThrow({
        where: { id: f.saleId },
      });
      const ar = await h.prisma.accountReceivable.findUniqueOrThrow({
        where: { id: f.arId },
      });
      const payments = await h.prisma.payment.findMany({
        where: { saleId: f.saleId, status: 'APPLIED' },
      });
      const balances = await h.prisma.inventoryBalance.findMany({
        where: { productId: f.productId },
      });
      const route = await h.prisma.deliveryRoute.findUniqueOrThrow({
        where: { id: f.routeId! },
        include: { settlement: true },
      });
      const order = await h.prisma.deliveryOrder.findUniqueOrThrow({
        where: { id: f.orderId! },
      });
      expect(sale.status).toBe(returned ? 'CANCELLED' : 'CONFIRMED');
      expect(ar.status).toBe(returned ? 'CANCELLED' : 'PAID');
      expect(Number(ar.outstandingAmount)).toBe(0);
      expect(payments.length).toBe(returned ? 0 : 2);
      expect(payments.reduce((n, p) => n + Number(p.amount), 0)).toBe(
        returned ? 0 : 100,
      );
      expect(balances.reduce((n, row) => n + row.quantityPieces, 0)).toBe(
        returned ? 10 : 9,
      );
      expect(
        balances
          .filter((row) => row.locationId === f.stockId)
          .every((row) => row.quantityPieces === 0),
      ).toBe(true);
      expect(route.status).toBe(returned ? 'CANCELLED' : 'COMPLETED');
      expect(order.status).toBe(returned ? 'CANCELLED' : 'DELIVERED');
      expect(
        await h.prisma.deliveryIncident.count({
          where: { deliveryOrderId: f.orderId },
        }),
      ).toBe(returned ? 1 : 0);
      expect(
        await h.prisma.deliveryEvidence.count({
          where: { deliveryOrderId: f.orderId },
        }),
      ).toBe(returned ? 0 : 1);
      if (!returned) {
        expect(route.settlement?.status).toBe('CLOSED');
        expect(Number(route.settlement?.expectedCashAmount)).toBe(40);
        expect(Number(route.settlement?.expectedTransferAmount)).toBe(60);
        expect(Number(route.settlement?.differenceAmount)).toBe(0);
        expect(
          payments
            .filter((p) => p.paymentMethod === 'CASH')
            .map((p) => Number(p.amount)),
        ).toEqual([40]);
        expect(
          payments
            .filter((p) => p.paymentMethod === 'TRANSFER')
            .map((p) => Number(p.amount)),
        ).toEqual([60]);
      }
      cycleEvidence.push({
        cycle,
        result: recovery.recovered(cycle) ? 'recovered' : 'direct',
        fixture: f,
        final: await snapshotProducts(h, [f.productId]),
      });
    }
    let polls = 0;
    async function monitor() {
      const bad = await h.prisma.$queryRaw<Array<{ bad: number }>>`
        SELECT count(*)::int AS bad FROM "InventoryBalance"
        WHERE "quantityKg" < 0 OR "quantityPieces" < 0 OR "reservedQuantityKg" < 0
          OR "reservedQuantityPieces" < 0 OR "reservedQuantityKg" > "quantityKg"
          OR "reservedQuantityPieces" > "quantityPieces"`;
      expect(bad[0].bad).toBe(0);
      expect((await h.get('reports/dashboard')).status).toBe(200);
      polls++;
    }
    async function cycle(n: number) {
      return recovery.cycle(n, async () => {
        const start = performance.now();
        try {
          const returned = n % 4 === 0;
          const f = await h.fixture(
            true,
            !returned,
            n % 2 ? 'warehouse' : 'admin',
          );
          if (returned) {
            const body = {
                status: 'RETURNED',
                reason: 'Physical customer return',
                returnedItems: [
                  {
                    productId: f.productId,
                    unit: 'PIECE',
                    quantityPieces: 1,
                    quantityKg: 0,
                    reason: 'Physical return',
                  },
                ],
              },
              key = h.key();
            expect(
              (
                await h.post(
                  `delivery-orders/${f.orderId}/incidents`,
                  body,
                  'driver',
                  key,
                )
              ).status,
            ).toBe(201);
            expect(
              (
                await h.post(
                  `delivery-orders/${f.orderId}/incidents`,
                  body,
                  'driver',
                  key,
                )
              ).status,
            ).toBe(201);
            const sale = await h.prisma.sale.findUniqueOrThrow({
              where: { id: f.saleId },
            });
            const voidBody = {
                expectedVersion: sale.version,
                reason: 'Return then void exactly once',
              },
              voidKey = h.key();
            expect(
              (
                await h.post(
                  `sales/${f.saleId}/void`,
                  voidBody,
                  'admin',
                  voidKey,
                )
              ).status,
            ).toBe(201);
            expect(
              (
                await h.post(
                  `sales/${f.saleId}/void`,
                  voidBody,
                  'admin',
                  voidKey,
                )
              ).status,
            ).toBe(201);
            await h.transfer(f.productId, f.stockId, h.cedisId, 10);
            expect(
              (
                await h.patch(`delivery-routes/${f.routeId}/status`, {
                  status: 'CANCELLED',
                })
              ).status,
            ).toBe(200);
            expect(
              await h.prisma.payment.count({
                where: { saleId: f.saleId, status: 'APPLIED' },
              }),
            ).toBe(0);
            await verifyCycle(n, f, true);
            completed.push({
              cycle: n,
              kind: 'returned-voided',
              productId: f.productId,
              saleId: f.saleId,
              ms: performance.now() - start,
            });
          } else {
            expect((await h.collect(f, 40)).status).toBe(201);
            const first = await h.post(
              `delivery-routes/${f.routeId}/settlement`,
            );
            expect(first.status).toBe(201);
            expect(
              (await h.collect(f, 60, 2, 'TRANSFER', 'collections')).status,
            ).toBe(201);
            const recalculated = await h.post(
              `delivery-routes/${f.routeId}/settlement`,
            );
            expect(recalculated.status).toBe(201);
            const settlement = data<{
              id: string;
              version: number;
              expectedCashAmount: string;
              expectedTransferAmount: string;
              differenceAmount: string;
            }>(recalculated);
            expect(Number(settlement.expectedCashAmount)).toBe(40);
            expect(Number(settlement.expectedTransferAmount)).toBe(60);
            expect(Number(settlement.differenceAmount)).toBe(0);
            const body = {
                expectedVersion: settlement.version,
                notes: 'Audit only, no external cash',
              },
              key = h.key();
            expect(
              (
                await h.post(
                  `route-settlements/${settlement.id}/close`,
                  body,
                  'admin',
                  key,
                )
              ).status,
            ).toBe(201);
            expect(
              (
                await h.post(
                  `route-settlements/${settlement.id}/close`,
                  body,
                  'admin',
                  key,
                )
              ).status,
            ).toBe(201);
            expect(
              Number(
                (
                  await h.prisma.accountReceivable.findUniqueOrThrow({
                    where: { id: f.arId },
                  })
                ).outstandingAmount,
              ),
            ).toBe(0);
            await verifyCycle(n, f, false);
            completed.push({
              cycle: n,
              kind: 'two-pass-closed',
              productId: f.productId,
              saleId: f.saleId,
              settlementId: settlement.id,
              ms: performance.now() - start,
            });
          }
        } catch (error) {
          failures.push({
            cycle: n,
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          proof('resistance-operations', recovery.operations);
          proof('resistance-cycles', {
            completed: cycleEvidence,
            aborted: failures,
          });
        }
      });
    }
    let nextWave = began,
      nextPoll = began,
      started = 0;
    while (performance.now() - began < seconds * 1000) {
      const now = performance.now();
      if (now >= nextWave && started < Math.ceil(seconds / 60) * 2) {
        const n = started;
        started += 2;
        await Promise.all([cycle(n), cycle(n + 1)]);
        nextWave += 60000;
      }
      if (performance.now() >= nextPoll) {
        try {
          await monitor();
        } catch (error) {
          failures.push({ cycle: -1, message: String(error) });
        }
        nextPoll += 2000;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(
            200,
            Math.max(1, began + seconds * 1000 - performance.now()),
          ),
        ),
      );
    }
    // Include purchases/stock from fixtures that aborted before assignment or delivery.
    const ids = h.createdProductIds;
    const saleIds = (
      await h.prisma.sale.findMany({
        where: { items: { some: { productId: { in: ids } } } },
        select: { id: true },
      })
    ).map((sale) => sale.id);
    async function snapshot() {
      return {
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
          where: {
            id: {
              in: completed.flatMap((x) =>
                x.settlementId ? [x.settlementId] : [],
              ),
            },
          },
          orderBy: { id: 'asc' },
        }),
      };
    }
    const before = await snapshot(),
      elapsed = performance.now() - began;
    await h.restart();
    const after = await snapshot();
    const latency = h.events.map((x) => x.ms).sort((a, b) => a - b);
    const percentile = (q: number) =>
      Math.round((latency[Math.ceil(latency.length * q) - 1] ?? 0) * 100) / 100;
    const http: Record<string, number> = {};
    for (const x of h.events) http[x.http] = (http[x.http] ?? 0) + 1;
    const kinds = (event: string) =>
      h.retryEvents.filter((x) => x.event === event).length;
    const applied = before.payments
      .filter((x) => x.status === 'APPLIED')
      .reduce((n, x) => n + Number(x.amount), 0);
    const pieceTotal = before.balances.reduce(
      (n, x) => n + x.quantityPieces,
      0,
    );
    const result = {
      durationMs: Math.round(elapsed),
      started,
      completed: completed.length,
      completedDirectly: completed.filter((x) => !recovery.recovered(x.cycle))
        .length,
      completedAfterRecovery: completed.filter((x) =>
        recovery.recovered(x.cycle),
      ).length,
      initialConflicts: recovery.operations
        .filter((x) => x.http === 409)
        .map((x) => ({
          cycle: x.cycle,
          operation: x.operation,
          attempt: x.attempt,
          method: x.method,
          path: x.path,
          role: x.role,
          key: x.key,
          expectedVersion: x.expectedVersion,
          error: x.error,
          classification: x.classification,
          rollbackVerified: x.rollbackVerified,
          requestId: x.requestId,
        })),
      aborted: failures.length,
      completedCycles: completed,
      failures,
      polls,
      requests: h.events.length,
      http,
      latencyMs: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        max: percentile(1),
      },
      transactionRetries: kinds('purchase_transaction_retry'),
      recoveredTransactions: kinds('purchase_transaction_recovered'),
      exhaustedTransactions: kinds('purchase_transaction_exhausted'),
      appliedMoney: applied,
      remainingAR: before.receivables.reduce(
        (n, x) => n + Number(x.outstandingAmount),
        0,
      ),
      physicalPieces: pieceTotal,
      productsCreated: ids.length,
      purchaseRows: await h.prisma.purchase.count({
        where: { items: { some: { productId: { in: ids } } } },
      }),
      purchaseItemRows: await h.prisma.purchaseItem.count({
        where: { productId: { in: ids } },
      }),
      persistedAfterRestart: JSON.stringify(before) === JSON.stringify(after),
      scope:
        '600+ active seconds, two cycles/minute; not eight-hour acceptance or production capacity',
    };
    proof('resistance', result);
    proof('resistance-operations', recovery.operations);
    proof('resistance-cycles', { completed: cycleEvidence, aborted: failures });
    proof('resistance-final-data', before);
    proof('resistance-http', h.events);
    console.log(JSON.stringify(result));
    expect(started).toBe(Math.ceil(seconds / 60) * 2);
    expect(result.durationMs).toBeGreaterThanOrEqual(seconds * 1000);
    expect(result.purchaseRows).toBe(started);
    expect(result.purchaseItemRows).toBe(started);
    expect(failures).toEqual([]);
    expect(completed.length).toBe(started);
    expect(result.exhaustedTransactions).toBe(0);
    expect(result.persistedAfterRestart).toBe(true);
    expect(result.remainingAR).toBe(0);
    expect(applied).toBe(
      completed.filter((x) => x.kind === 'two-pass-closed').length * 100,
    );
    expect(pieceTotal).toBe(
      completed.filter((x) => x.kind === 'two-pass-closed').length * 9 +
        completed.filter((x) => x.kind === 'returned-voided').length * 10,
    );
  }, 3750000);
});
