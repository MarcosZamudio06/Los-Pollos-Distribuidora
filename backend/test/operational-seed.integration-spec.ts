import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed';
import { runOperationalSeed } from '../prisma/seed.operational';
import {
  seedId,
  seedPurchaseNumber,
  seedSuppliers,
} from '../prisma/seed.operational.data';
import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('Operational seed on disposable PostgreSQL/PostGIS', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    prisma = new PrismaClient();
    await seed(prisma as never);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sku: 'DEV-WHOLE-CHICKEN-KG' },
    });
    const location = await prisma.operationalLocation.findUniqueOrThrow({
      where: { code: 'VER' },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'dev.admin@pollos.local' },
    });
    // Independent opening adjustment: the seed must not erase shared balances/history.
    await prisma.$transaction(async (tx) => {
      await tx.inventoryBalance.create({
        data: {
          productId: product.id,
          locationId: location.id,
          quantityKg: 17,
          quantityPieces: 0,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          id: 'independent-opening-adjustment',
          productId: product.id,
          locationId: location.id,
          userId: user.id,
          type: 'ADJUSTMENT',
          quantity: 17,
          quantityKg: 17,
          quantityPieces: 0,
          previousStock: 0,
          newStock: 17,
          previousQuantityKg: 0,
          newQuantityKg: 17,
          previousQuantityPieces: 0,
          newQuantityPieces: 0,
          reason: 'Independent opening inventory',
        },
      });
    });
  }, 120000);

  afterAll(async () => prisma?.$disconnect());

  async function snapshot() {
    return {
      purchases: await prisma.purchase.findMany({ orderBy: { id: 'asc' } }),
      sales: await prisma.sale.findMany({ orderBy: { id: 'asc' } }),
      balances: await prisma.inventoryBalance.findMany({
        orderBy: { id: 'asc' },
      }),
      movements: await prisma.inventoryMovement.findMany({
        orderBy: { id: 'asc' },
      }),
      transfers: await prisma.inventoryTransfer.findMany({
        orderBy: { id: 'asc' },
      }),
      receipts: await prisma.branchSupplyReceipt.findMany({
        include: { items: true },
        orderBy: { id: 'asc' },
      }),
      cycles: await prisma.branchSupplyCycle.findMany({
        orderBy: { id: 'asc' },
      }),
      events: await prisma.branchSupplyCycleEvent.findMany({
        orderBy: { id: 'asc' },
      }),
      payments: await prisma.payment.findMany({ orderBy: { id: 'asc' } }),
      closes: await prisma.pointOfSaleDailyClose.findMany({
        orderBy: { id: 'asc' },
      }),
      customers: await prisma.customer.findMany({ orderBy: { id: 'asc' } }),
      suppliers: await prisma.supplier.findMany({ orderBy: { id: 'asc' } }),
      routes: await prisma.deliveryRoute.findMany({ orderBy: { id: 'asc' } }),
      receivables: await prisma.accountReceivable.findMany({
        orderBy: { id: 'asc' },
      }),
      settlements: await prisma.routeSettlement.findMany({
        orderBy: { id: 'asc' },
      }),
      cash: await prisma.cashMovement.findMany({ orderBy: { id: 'asc' } }),
    };
  }

  it('rolls back a failed supply, including previously created purchases', async () => {
    const branch = await prisma.operationalLocation.findUniqueOrThrow({
      where: { code: 'BDR' },
    });
    await prisma.operationalLocation.update({
      where: { id: branch.id },
      data: { latitude: null, longitude: null },
    });
    const before = await snapshot();
    try {
      await expect(runOperationalSeed(prisma)).rejects.toThrow(/coordinates/i);
      expect(await snapshot()).toEqual(before);
    } finally {
      await prisma.operationalLocation.update({
        where: { id: branch.id },
        data: { latitude: branch.latitude, longitude: branch.longitude },
      });
    }
  }, 120000);

  it('preserves an actual legacy partial purchase and refuses destructive recovery', async () => {
    const supplier = seedSuppliers[0];
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      create: supplier,
      update: {},
    });
    const cedis = await prisma.operationalLocation.findUniqueOrThrow({
      where: { code: 'CEDIS-VER' },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'dev.warehouse@pollos.local' },
    });
    const purchase = await prisma.purchase.create({
      data: {
        id: seedId('purchase-1'),
        purchaseNumber: seedPurchaseNumber(1),
        supplierId: supplier.id,
        userId: user.id,
        locationId: cedis.id,
        subtotal: 0,
        total: 0,
        status: 'CONFIRMED',
      },
    });
    const before = await snapshot();
    try {
      await expect(runOperationalSeed(prisma)).rejects.toThrow(
        'OPERATIONAL_SEED_PARTIAL_STATE',
      );
      expect(await snapshot()).toEqual(before);
    } finally {
      // Only this test's incomplete, unreceived fixture is removed.
      await prisma.purchase.delete({ where: { id: purchase.id } });
    }
  }, 120000);

  it('creates 12 purchases and 150 sales through parent CEDIS supplies, then replays without mutations', async () => {
    await expect(runOperationalSeed(prisma)).resolves.toEqual({
      status: 'created',
    });
    const state = await snapshot();
    expect(state.purchases).toHaveLength(12);
    expect(state.sales).toHaveLength(150);
    expect(state.closes).toHaveLength(9);
    expect(state.cycles).toHaveLength(3);
    expect(state.receipts).toHaveLength(12);
    expect(state.transfers).toHaveLength(19);
    expect(
      state.movements.find((m) => m.id === 'independent-opening-adjustment')
        ?.reason,
    ).toBe('Independent opening inventory');
    expect(await prisma.customer.count()).toBeGreaterThan(0);
    expect(await prisma.accountReceivable.count()).toBeGreaterThan(0);
    expect(await prisma.deliveryOrder.count()).toBe(30);
    expect(await prisma.routeSettlement.count()).toBe(2);
    const purchaseItems = await prisma.purchaseItem.findMany({
      include: { product: true },
    });
    expect(
      purchaseItems
        .filter((i) => i.product.sku === 'DEV-WHOLE-CHICKEN-KG')
        .reduce((n, i) => n + Number(i.quantityKg), 0),
    ).toBe(2784);
    expect(
      purchaseItems
        .filter((i) => i.product.sku === 'DEV-BREAST-KG')
        .reduce((n, i) => n + Number(i.quantityKg), 0),
    ).toBe(1392);
    expect(
      purchaseItems
        .filter((i) => i.product.sku === 'DEV-WINGS-PIECE')
        .reduce((n, i) => n + (i.quantityPieces ?? 0), 0),
    ).toBe(6600);
    expect(state.payments.length).toBeGreaterThan(0);
    const cedis = await prisma.operationalLocation.findUniqueOrThrow({
      where: { code: 'CEDIS-VER' },
    });
    expect(state.purchases.every((p) => p.locationId === cedis.id)).toBe(true);
    for (const code of ['VER', 'BDR', 'ALV']) {
      const branch = await prisma.operationalLocation.findUniqueOrThrow({
        where: { code },
      });
      const cycle = state.cycles.find((c) => c.branchLocationId === branch.id)!;
      expect(cycle.distributionCenterLocationId).toBe(branch.parentId);
      expect(
        state.receipts.filter((r) => r.branchSupplyCycleId === cycle.id),
      ).toHaveLength(4);
    }
    for (const receipt of state.receipts) {
      const transfer = state.transfers.find(
        (t) => t.id === receipt.inventoryTransferId,
      )!;
      expect(transfer.status).toBe('CONFIRMED');
      expect(transfer.originLocationId).toBe(cedis.id);
      expect(receipt.items).toHaveLength(3);
      for (const item of receipt.items) {
        expect(Number(item.receivedKg)).toBe(Number(item.sentKg));
        expect(item.receivedPieces).toBe(item.sentPieces);
        expect(Number(item.differenceKg)).toBe(0);
        expect(item.differencePieces).toBe(0);
      }
    }
    for (const balance of state.balances) {
      expect(Number(balance.quantityKg)).toBeGreaterThanOrEqual(0);
      expect(balance.quantityPieces).toBeGreaterThanOrEqual(0);
      expect(Number(balance.reservedQuantityKg)).toBe(0);
      expect(balance.reservedQuantityPieces).toBe(0);
      const movements = state.movements.filter(
        (m) =>
          m.locationId === balance.locationId &&
          m.productId === balance.productId,
      );
      expect(
        movements.reduce(
          (n, m) => n + Number(m.newQuantityKg) - Number(m.previousQuantityKg),
          0,
        ),
      ).toBeCloseTo(Number(balance.quantityKg), 3);
      expect(
        movements.reduce(
          (n, m) =>
            n + (m.newQuantityPieces ?? 0) - (m.previousQuantityPieces ?? 0),
          0,
        ),
      ).toBe(balance.quantityPieces);
    }
    expect(
      state.movements.every(
        (m) => Number(m.newQuantityKg) >= 0 && (m.newQuantityPieces ?? 0) >= 0,
      ),
    ).toBe(true);
    // Replay must not replace historical, append-only demo operations.
    await expect(runOperationalSeed(prisma)).resolves.toEqual({
      status: 'already-complete',
    });
    expect(await snapshot()).toEqual(state);
    // The real PostgreSQL protections remain enabled, not just application checks.
    await expect(
      prisma.branchSupplyReceipt.update({
        where: { id: state.receipts[0].id },
        data: { notes: 'forbidden mutation' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.branchSupplyReceiptItem.delete({
        where: { id: state.receipts[0].items[0].id },
      }),
    ).rejects.toThrow(/append-only/);
    expect(await snapshot()).toEqual(state);
  }, 120000);
});
