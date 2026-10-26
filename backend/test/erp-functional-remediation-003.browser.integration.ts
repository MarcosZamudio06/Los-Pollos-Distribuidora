import { routePlannerCustodyJourney } from './erp-rem003-browser-journey';
import { DEVELOPMENT_ADMIN_PASSWORD } from '../prisma/seed';
import { Rem003Harness, proof } from './erp-rem003-harness';

describe('FUNC-010 real Linux Chromium + Photon/OSRM/VROOM + PostGIS', () => {
  const h = new Rem003Harness();
  beforeAll(async () => {
    if (!process.env.REM003_BROWSER_WS || !process.env.REM003_FRONTEND_DIST)
      throw new Error(
        'Explicit real browser/frontend/GIS environment is required',
      );
    for (const key of ['PHOTON_URL', 'OSRM_URL', 'VROOM_URL']) {
      const url = new URL(process.env[key]!);
      if (url.hostname !== '127.0.0.1' || url.port === '1')
        throw new Error('Dedicated local real GIS providers required');
    }
    await h.start();
  }, 120000);
  afterAll(async () => h.close());

  it('finds ROUTE sale from CEDIS, geocodes, plans and consumes without changing custody', async () => {
    const f = await h.fixture();
    const origin = await h.prisma.operationalLocation.create({
      data: {
        name: h.key(),
        code: h.key(),
        type: 'DISTRIBUTION_CENTER',
        latitude: 19.179094,
        longitude: -96.1233923,
      },
    });
    const vehicle = await h.prisma.vehicle.create({
      data: {
        code: h.key(),
        displayName: 'Rem003 disposable vehicle',
        isActive: true,
      },
    });
    const balances = await h.prisma.inventoryBalance.findMany({
      where: { productId: f.productId },
      orderBy: { locationId: 'asc' },
    });
    const scheduledDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const result = await routePlannerCustodyJourney({
      url: h.url,
      wsEndpoint: process.env.REM003_BROWSER_WS!,
      email: 'dev.admin@pollos.local',
      password: DEVELOPMENT_ADMIN_PASSWORD,
      originId: origin.id,
      saleId: f.saleId,
      saleNumber: f.saleNumber,
      driverId: h.driverId,
      vehicleId: vehicle.id,
      scheduledDate,
      evidenceDir: process.env.REM003_EVIDENCE_DIR,
    });
    const route = await h.prisma.deliveryRoute.findUniqueOrThrow({
      where: { id: result.routeId },
      include: { deliveryOrders: true },
    });
    expect(route.originLocationId).toBe(origin.id);
    expect(route.routeStockLocationId).toBe(f.stockId);
    expect(route.deliveryOrders.map((x) => x.saleId)).toEqual([f.saleId]);
    expect(route.deliveryOrders[0].accountReceivableId).toBe(f.arId);
    const sale = await h.prisma.sale.findUniqueOrThrow({
      where: { id: f.saleId },
    });
    expect(sale.locationId).toBe(f.stockId);
    expect(sale.saleChannel).toBe('ROUTE');
    expect(sale.routeId).toBe(route.id);
    expect(
      await h.prisma.inventoryBalance.findMany({
        where: { productId: f.productId },
        orderBy: { locationId: 'asc' },
      }),
    ).toEqual(balances);
    expect(
      (
        await h.prisma.deliveryRoutePlanDraft.findUniqueOrThrow({
          where: { id: result.planId },
        })
      ).consumedAt,
    ).not.toBeNull();
    proof('planner-browser', {
      ...result,
      stockId: f.stockId,
      originId: origin.id,
      saleId: f.saleId,
      inventoryUnchanged: true,
    });
  }, 120000);
});
