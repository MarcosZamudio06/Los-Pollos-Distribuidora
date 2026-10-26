import { Rem003Harness, data, proof } from './erp-rem003-harness';
import type { Prisma } from '@prisma/client';

describe('Remediation003 real HTTP/PostGIS: receiving and planner eligibility', () => {
  const h = new Rem003Harness();
  beforeAll(async () => h.start(), 120000);
  afterAll(async () => h.close());

  it('FUNC-009: five ADMIN/WAREHOUSE purchase pairs finish once per independent key', async () => {
    const p = await h.product();
    const body = await h.purchaseBody(p.id);
    const pairs: number[][] = [];
    for (let n = 0; n < 5; n++) {
      const keys = [h.key(), h.key()];
      const results = await Promise.all([
        h.post('purchases', body, 'admin', keys[0]),
        h.post('purchases', body, 'warehouse', keys[1]),
      ]);
      pairs.push(results.map((x) => x.status));
      // Preserve all five original RED pairs, not only the first failure.
      for (let i = 0; i < 2; i++) {
        if (results[i].status !== 201)
          expect(
            (
              await h.post(
                'purchases',
                body,
                i ? 'warehouse' : 'admin',
                keys[i],
              )
            ).status,
          ).toBe(201);
        expect(
          (await h.post('purchases', body, i ? 'warehouse' : 'admin', keys[i]))
            .status,
        ).toBe(201);
      }
    }
    const purchases = await h.prisma.purchase.count({
      where: { items: { some: { productId: p.id } } },
    });
    const movements = await h.prisma.inventoryMovement.count({
      where: { productId: p.id, type: 'PURCHASE' },
    });
    const balance = await h.prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        productId_locationId: { productId: p.id, locationId: h.cedisId },
      },
    });
    proof('receiving-five-pairs', {
      productId: p.id,
      pairs,
      purchases,
      movements,
      pieces: balance.quantityPieces,
      retryEvents: h.retryEvents,
    });
    expect(purchases).toBe(10);
    expect(movements).toBe(10);
    expect(balance.quantityPieces).toBe(100);
    expect(pairs.flat()).toEqual(Array<number>(10).fill(201));
  });

  it('FUNC-009: concurrent different products and simultaneous same-command replay do not duplicate', async () => {
    const products = await Promise.all([h.product(), h.product()]);
    const bodies = await Promise.all(products.map((p) => h.purchaseBody(p.id)));
    const results = await Promise.all(
      bodies.map((b, i) => h.post('purchases', b, i ? 'warehouse' : 'admin')),
    );
    expect(results.map((x) => x.status)).toEqual([201, 201]);
    const key = h.key();
    const replays = await Promise.all([
      h.post('purchases', bodies[0], 'admin', key),
      h.post('purchases', bodies[0], 'admin', key),
    ]);
    expect(replays.map((x) => x.status)).toEqual([201, 201]);
    expect(data<{ id: string }>(replays[0]).id).toBe(
      data<{ id: string }>(replays[1]).id,
    );
    expect(
      await h.prisma.purchase.count({
        where: { items: { some: { productId: products[0].id } } },
      }),
    ).toBe(2);
    expect(
      await h.prisma.inventoryMovement.count({
        where: { productId: products[0].id, type: 'PURCHASE' },
      }),
    ).toBe(2);
  });

  it('FUNC-009: actual validation, inactive suppliers, authorization and payload conflicts stay errors', async () => {
    const p = await h.product(),
      body = await h.purchaseBody(p.id),
      key = h.key();
    const before = h.retryEvents.length;
    expect((await h.post('purchases', body, 'seller')).status).toBe(403);
    expect(
      (
        await h.post('purchases', {
          ...body,
          items: [{ ...body.items[0], quantityPieces: -1 }],
        })
      ).status,
    ).toBe(400);
    await h.prisma.supplier.update({
      where: { id: body.supplierId },
      data: { isActive: false },
    });
    expect((await h.post('purchases', body)).status).toBe(400);
    await h.prisma.supplier.update({
      where: { id: body.supplierId },
      data: { isActive: true },
    });
    expect((await h.post('purchases', body, 'admin', key)).status).toBe(201);
    expect(
      (
        await h.post(
          'purchases',
          { ...body, items: [{ ...body.items[0], quantityPieces: 11 }] },
          'admin',
          key,
        )
      ).status,
    ).toBe(409);
    expect(h.retryEvents).toHaveLength(before);
  });

  it('FUNC-009: nonrecoverable database failure rolls back purchase, item, balance and movement', async () => {
    const p = await h.product(),
      body = await h.purchaseBody(p.id);
    expect(p.id).toMatch(/^[a-z0-9]+$/);
    const before = h.retryEvents.length;
    // Owned disposable DB only. Fail AFTER purchase/item/balance writes, before its movement commits.
    await h.prisma.$executeRawUnsafe(
      `CREATE FUNCTION rem003_reject_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."productId" = TG_ARGV[0] AND NEW.type = 'PURCHASE' THEN RAISE EXCEPTION 'rem003 rollback probe' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$`,
    );
    await h.prisma.$executeRawUnsafe(
      `CREATE TRIGGER rem003_reject_movement BEFORE INSERT ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION rem003_reject_movement('${p.id}')`,
    );
    try {
      expect((await h.post('purchases', body)).status).toBe(500);
      expect(
        await h.prisma.purchaseItem.count({ where: { productId: p.id } }),
      ).toBe(0);
      expect(
        await h.prisma.inventoryMovement.count({ where: { productId: p.id } }),
      ).toBe(0);
      expect(
        await h.prisma.inventoryBalance.count({ where: { productId: p.id } }),
      ).toBe(0);
      expect(h.retryEvents).toHaveLength(before);
    } finally {
      await h.prisma.$executeRawUnsafe(
        'DROP TRIGGER rem003_reject_movement ON "InventoryMovement"',
      );
      await h.prisma.$executeRawUnsafe(
        'DROP FUNCTION rem003_reject_movement()',
      );
    }
  });

  it('FUNC-010: eligible search is separate from physical origin and excludes cancelled/assigned sales', async () => {
    const f = await h.fixture();
    const all = await h.get(
      'delivery-route-planning/eligible-sales?search=' + f.saleNumber,
    );
    expect(
      data<{ items: Array<{ saleId: string }> }>(all).items.map(
        (x) => x.saleId,
      ),
    ).toContain(f.saleId);
    // Compatibility: explicit legacy originLocationId still means a Sale.locationId filter.
    const filtered = await h.get(
      'delivery-route-planning/eligible-sales?search=' +
        f.saleNumber +
        '&originLocationId=' +
        h.cedisId,
    );
    expect(data<{ items: unknown[] }>(filtered).items).toEqual([]);
    const sale = await h.prisma.sale.findUniqueOrThrow({
      where: { id: f.saleId },
    });
    expect(
      (
        await h.post(`sales/${f.saleId}/void`, {
          expectedVersion: sale.version,
          reason: 'Audit cancellation',
        })
      ).status,
    ).toBe(201);
    expect(
      data<{ items: unknown[] }>(
        await h.get(
          'delivery-route-planning/eligible-sales?search=' + f.saleNumber,
        ),
      ).items,
    ).toEqual([]);
    const assigned = await h.fixture(true);
    expect(
      data<{ items: unknown[] }>(
        await h.get(
          'delivery-route-planning/eligible-sales?search=' +
            assigned.saleNumber,
        ),
      ).items,
    ).toEqual([]);
  });

  it('FUNC-009: real SQL serialization exhaustion is controlled, rolls back, and permits same-key recovery', async () => {
    const p = await h.product(),
      body = await h.purchaseBody(p.id),
      key = h.key();
    expect(p.id).toMatch(/^[a-z0-9]+$/);
    const start = h.retryEvents.length;
    await h.prisma.$executeRawUnsafe(
      `CREATE FUNCTION rem003_force_serialization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."productId" = TG_ARGV[0] THEN RAISE EXCEPTION 'rem003 serialization exhaustion probe' USING ERRCODE = '40001'; END IF; RETURN NEW; END $$`,
    );
    await h.prisma.$executeRawUnsafe(
      `CREATE TRIGGER rem003_force_serialization BEFORE INSERT ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION rem003_force_serialization('${p.id}')`,
    );
    try {
      const response = await h.post('purchases', body, 'admin', key);
      expect(response.status).toBe(409);
      expect(response.body as unknown).toMatchObject({
        error: 'PURCHASE_CONCURRENCY_RETRY_EXHAUSTED',
      });
      expect(
        h.retryEvents
          .slice(start)
          .filter((x) => x.event === 'purchase_transaction_retry'),
      ).toHaveLength(4);
      expect(
        h.retryEvents
          .slice(start)
          .filter((x) => x.event === 'purchase_transaction_exhausted'),
      ).toHaveLength(1);
      expect(
        await h.prisma.purchaseItem.count({ where: { productId: p.id } }),
      ).toBe(0);
      expect(
        await h.prisma.inventoryMovement.count({ where: { productId: p.id } }),
      ).toBe(0);
      expect(
        await h.prisma.inventoryBalance.count({ where: { productId: p.id } }),
      ).toBe(0);
    } finally {
      await h.prisma.$executeRawUnsafe(
        'DROP TRIGGER rem003_force_serialization ON "InventoryMovement"',
      );
      await h.prisma.$executeRawUnsafe(
        'DROP FUNCTION rem003_force_serialization()',
      );
    }
    expect((await h.post('purchases', body, 'admin', key)).status).toBe(201);
    expect((await h.post('purchases', body, 'admin', key)).status).toBe(201);
    expect(
      await h.prisma.inventoryMovement.count({
        where: { productId: p.id, type: 'PURCHASE' },
      }),
    ).toBe(1);
    proof('controlled-exhaustion', {
      HTTP: 409,
      retries: 4,
      attempts: 5,
      exhausted: 1,
      rollback: true,
      sameKeyRecovery: 201,
      movements: 1,
    });
  });

  it('FUNC-010: seller search cannot reveal sales outside its owner/location scope', async () => {
    const f = await h.fixture();
    const response = await h.get(
      'delivery-route-planning/eligible-sales?search=' + f.saleNumber,
      'seller',
    );
    expect(response.status).toBe(200);
    expect(data<{ items: unknown[] }>(response).items).toEqual([]);
    const bypass = await h.get(
      'delivery-route-planning/eligible-sales?search=' +
        f.saleNumber +
        '&originLocationId=' +
        f.stockId,
      'seller',
    );
    expect(data<{ items: unknown[] }>(bypass).items).toEqual([]);
    expect(
      (await h.get('delivery-route-planning/eligible-sales', 'driver')).status,
    ).toBe(403);
  });

  it('keeps receiving and sale custody persisted after NestJS restart', async () => {
    const f = await h.fixture();
    const before = await h.prisma.inventoryBalance.findMany({
      where: { productId: f.productId },
      orderBy: { locationId: 'asc' },
    });
    await h.restart();
    expect(
      await h.prisma.inventoryBalance.findMany({
        where: { productId: f.productId },
        orderBy: { locationId: 'asc' },
      }),
    ).toEqual(before);
    expect(
      (await h.prisma.sale.findUniqueOrThrow({ where: { id: f.saleId } }))
        .locationId,
    ).toBe(f.stockId);
  });

  it('FUNC-010: an authorized seller can find its own ROUTE sale but cannot override location scope', async () => {
    const f = await h.fixture();
    const seller = await h.prisma.user.findUniqueOrThrow({
      where: { email: 'dev.seller@pollos.local' },
    });
    try {
      await h.prisma.user.update({
        where: { id: seller.id },
        data: { operationalLocationId: f.stockId },
      });
      const created = await h.post(
        'sales',
        {
          locationId: f.stockId,
          saleChannel: 'ROUTE',
          documentType: 'INTERNAL_RECEIPT',
          paymentType: 'CREDIT_SALE',
          customerId: f.customerId,
          payments: [],
          items: [{ productId: f.productId, unit: 'PIECE', quantityPieces: 1 }],
        },
        'seller',
      );
      expect(created.status).toBe(201);
      const sale = data<{ sale: { id: string; saleNumber: string } }>(
        created,
      ).sale;
      expect(
        data<{ items: Array<{ saleId: string }> }>(
          await h.get(
            'delivery-route-planning/eligible-sales?search=' + sale.saleNumber,
            'seller',
          ),
        ).items.map((x) => x.saleId),
      ).toEqual([sale.id]);
      expect(
        data<{ items: unknown[] }>(
          await h.get(
            'delivery-route-planning/eligible-sales?search=' + f.saleNumber,
            'seller',
          ),
        ).items,
      ).toEqual([]);
      await h.prisma.user.update({
        where: { id: seller.id },
        data: { operationalLocationId: h.cedisId },
      });
      expect(
        data<{ items: unknown[] }>(
          await h.get(
            'delivery-route-planning/eligible-sales?search=' +
              sale.saleNumber +
              '&originLocationId=' +
              f.stockId,
            'seller',
          ),
        ).items,
      ).toEqual([]);
    } finally {
      await h.prisma.user.update({
        where: { id: seller.id },
        data: { operationalLocationId: seller.operationalLocationId },
      });
    }
  });

  it('FUNC-010: consuming a UI-shaped plan reuses ROUTE sale custody instead of creating an empty stock', async () => {
    const f = await h.fixture();
    const origin = await h.prisma.operationalLocation.create({
      data: {
        code: h.key(),
        name: h.key(),
        type: 'DISTRIBUTION_CENTER',
        latitude: 19.179094,
        longitude: -96.1233923,
      },
    });
    const vehicle = await h.prisma.vehicle.create({
      data: { code: h.key(), displayName: h.key() },
    });
    const admin = await h.prisma.user.findUniqueOrThrow({
      where: { email: 'dev.admin@pollos.local' },
    });
    const date = new Date().toISOString().slice(0, 10);
    // A persisted plan fixture isolates consumption; the browser test separately obtains a real VROOM/OSRM plan.
    const draft = await h.prisma.deliveryRoutePlanDraft.create({
      data: {
        createdByUserId: admin.id,
        driverId: h.driverId,
        vehicleId: vehicle.id,
        scheduledDate: new Date(date),
        originLocationId: origin.id,
        orderedStops: [
          {
            saleId: f.saleId,
            sequence: 1,
            deliveryAddress: 'Audit destination',
            latitude: 19.1841646,
            longitude: -96.1386664,
          },
        ],
        geometry: {
          type: 'LineString',
          coordinates: [
            [-96.1233923, 19.179094],
            [-96.1386664, 19.1841646],
            [-96.1233923, 19.179094],
          ],
        },
        distanceMeters: 1000,
        durationSeconds: 100,
        routingProfile: 'driving',
        routingDataVersion: 'consumption-fixture-not-GIS-proof',
        requestHash: h.key(),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const before = await h.prisma.inventoryBalance.findMany({
      where: { productId: f.productId },
      orderBy: { locationId: 'asc' },
    });
    const body = {
      name: h.key(),
      driverId: h.driverId,
      vehicleId: vehicle.id,
      scheduledDate: date,
      originLocationId: origin.id,
      routePlanId: draft.id,
    };
    const key = h.key();
    const wrongStock = await h.prisma.operationalLocation.create({
      data: { name: h.key(), code: h.key(), type: 'ROUTE_STOCK' },
    });
    const mismatched = await h.post('delivery-routes', {
      ...body,
      routeStockLocationId: wrongStock.id,
    });
    expect(mismatched.status).toBe(409);
    expect(mismatched.body as unknown).toMatchObject({
      error: 'ROUTE_STOCK_CONTEXT_MISMATCH',
    });
    expect(
      (
        await h.prisma.deliveryRoutePlanDraft.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).consumedAt,
    ).toBeNull();
    const other = await h.fixture();
    const otherStop = {
      saleId: other.saleId,
      sequence: 2,
      deliveryAddress: 'Second custody fixture',
      latitude: 19.184,
      longitude: -96.138,
    };
    // Controlled stale/cross-custody plan inputs; no claim that this fixture was produced by GIS.
    await h.prisma.deliveryRoutePlanDraft.update({
      where: { id: draft.id },
      data: {
        orderedStops: [
          ...(draft.orderedStops as Prisma.JsonArray),
          otherStop,
        ] as Prisma.InputJsonValue,
      },
    });
    const mixed = await h.post('delivery-routes', body);
    expect(mixed.status).toBe(409);
    expect(mixed.body as unknown).toMatchObject({
      error: 'ROUTE_STOCK_CONTEXT_MISMATCH',
    });
    const otherSale = await h.prisma.sale.findUniqueOrThrow({
      where: { id: other.saleId },
    });
    expect(
      (
        await h.post(`sales/${other.saleId}/void`, {
          expectedVersion: otherSale.version,
          reason: 'Cancelled after planning',
        })
      ).status,
    ).toBe(201);
    expect((await h.post('delivery-routes', body)).status).toBe(400);
    expect(
      (
        await h.prisma.deliveryRoutePlanDraft.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).consumedAt,
    ).toBeNull();
    await h.prisma.deliveryRoutePlanDraft.update({
      where: { id: draft.id },
      data: {
        orderedStops: draft.orderedStops as Prisma.InputJsonValue,
      },
    });
    const response = await h.post('delivery-routes', body, 'admin', key);
    expect(response.status).toBe(201);
    const route = data<{ id: string; routeStockLocationId: string }>(response);
    proof('planner-consumption', {
      saleId: f.saleId,
      saleStock: f.stockId,
      routeStock: route.routeStockLocationId,
      routeId: route.id,
    });
    expect(route.routeStockLocationId).toBe(f.stockId);
    expect(
      (await h.prisma.sale.findUniqueOrThrow({ where: { id: f.saleId } }))
        .locationId,
    ).toBe(f.stockId);
    expect(
      await h.prisma.inventoryBalance.findMany({
        where: { productId: f.productId },
        orderBy: { locationId: 'asc' },
      }),
    ).toEqual(before);
    expect(
      data<{ id: string }>(await h.post('delivery-routes', body, 'admin', key))
        .id,
    ).toBe(route.id);
  });
});
