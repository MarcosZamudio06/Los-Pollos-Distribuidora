import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import {
  InventoryMovementType,
  ProductPresentationType,
  ProductUnit,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';
import { PrismaService } from '../src/database/prisma.service';
import { AppModule } from '../src/app.module';
import { AccountsReceivableAgingJob } from '../src/modules/accounts-receivable/accounts-receivable-aging.job';
import { seed } from '../prisma/seed';
import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('branch location registration and supply (e2e)', () => {
  const marker = `e2e-branch-registration-${randomUUID()}`;
  const businessDate = '2099-01-01';
  const supplyQuantityKg = 5;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let cedisLocationId: string;
  let branchLocationId: string;
  let assignedDriverId: string;
  let vehicleId: string;
  let productId: string;
  let cycleId: string;
  let supplyTransferId: string;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    process.env.JWT_ACCESS_SECRET ??=
      'e2e-access-secret-at-least-32-characters';
    process.env.JWT_REFRESH_SECRET ??=
      'e2e-refresh-secret-at-least-32-characters';
    process.env.SWAGGER_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccountsReceivableAgingJob)
      .useValue({ onApplicationBootstrap: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureHttpApplication(app, moduleFixture.get(ConfigService));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    await seed(prisma as never);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'dev.admin@pollos.local',
        password: 'DevOnly-ChangeMe-2026!',
      })
      .expect(200);
    accessToken = loginResponse.body.data.accessToken as string;
    expect(loginResponse.body.data.user.role).toBe('ADMIN');

    const cedisCatalog = await request(app.getHttpServer())
      .get('/api/locations')
      .query({
        type: 'DISTRIBUTION_CENTER',
        isActive: true,
        page: 1,
        limit: 100,
      })
      .set(auth())
      .expect(200);
    const cedis = cedisCatalog.body.data.items.find(
      (location: { type: string; isActive: boolean }) =>
        location.type === 'DISTRIBUTION_CENTER' && location.isActive,
    ) as { id?: string } | undefined;
    if (!cedis?.id) {
      throw new Error('Active distribution center is missing');
    }
    cedisLocationId = cedis.id;

    const driver = await prisma.user.findUnique({
      where: { controlNumber: 'EPDP-000004' },
      select: { id: true },
    });
    if (!driver) throw new Error('Seed DRIVER is missing');
    assignedDriverId = driver.id;

    const created = await request(app.getHttpServer())
      .post('/api/locations')
      .set(auth())
      .send({
        name: marker,
        code: marker,
        type: 'BRANCH',
        parentId: cedisLocationId,
        address: 'Veracruz, Veracruz',
        latitude: 19.1738,
        longitude: -96.1342,
      })
      .expect(201);

    branchLocationId = created.body.data.id as string;
    const vehicle = await prisma.vehicle.create({
      data: {
        code: `${marker}-vehicle`,
        displayName: `${marker} vehicle`,
        homeLocationId: cedisLocationId,
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;
    expect(created.body.data).toEqual(
      expect.objectContaining({
        id: branchLocationId,
        name: marker,
        code: marker,
        type: 'BRANCH',
        parentId: cedisLocationId,
        address: 'Veracruz, Veracruz',
        latitude: 19.1738,
        longitude: -96.1342,
      }),
    );

    const catalog = await request(app.getHttpServer())
      .get(`/api/locations/${cedisLocationId}/branches`)
      .set(auth())
      .expect(200);
    const branchMatches = catalog.body.data.items.filter(
      (location: { id: string }) => location.id === branchLocationId,
    );
    expect(branchMatches).toHaveLength(1);
    expect(branchMatches[0]).toEqual(
      expect.objectContaining({
        type: 'BRANCH',
        parentId: cedisLocationId,
        address: 'Veracruz, Veracruz',
        latitude: 19.1738,
        longitude: -96.1342,
      }),
    );

    expect(
      await prisma.inventoryBalance.count({
        where: { locationId: branchLocationId },
      }),
    ).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: { locationId: branchLocationId },
      }),
    ).toBe(0);
    expect(
      await prisma.inventoryTransfer.count({
        where: {
          OR: [
            { originLocationId: branchLocationId },
            { destinationLocationId: branchLocationId },
          ],
        },
      }),
    ).toBe(0);
    expect(
      await prisma.branchSupplyCycle.count({
        where: { branchLocationId },
      }),
    ).toBe(0);
  });

  it('uses the new branch in a real CEDIS supply and receives inventory', async () => {
    const product = await prisma.product.create({
      data: {
        name: marker,
        sku: marker,
        presentationType: ProductPresentationType.WHOLE,
        salePrice: 58,
        purchaseCost: 42,
        unit: ProductUnit.KG,
        isActive: true,
      },
    });
    productId = product.id;

    await prisma.inventoryBalance.create({
      data: {
        productId,
        locationId: cedisLocationId,
        quantityKg: 10,
        quantityPieces: 0,
      },
    });

    const cyclePath = '/api/cedis/branch-supply-cycles';
    const opened = await request(app.getHttpServer())
      .post(cyclePath)
      .set(auth())
      .set('Idempotency-Key', `${marker}:open`)
      .send({
        distributionCenterLocationId: cedisLocationId,
        branchLocationId,
        businessDate,
        notes: marker,
      })
      .expect(201);
    cycleId = opened.body.data.id as string;
    expect(opened.body.data).toEqual(
      expect.objectContaining({
        distributionCenterLocationId: cedisLocationId,
        branchLocationId,
        status: 'OPEN',
      }),
    );

    const supply = await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/supplies`)
      .set(auth())
      .set('Idempotency-Key', `${marker}:supply`)
      .send({
        expectedVersion: opened.body.data.version,
        assignedDriverId,
        vehicleId,
        items: [{ productId, unit: 'KG', quantityKg: supplyQuantityKg }],
      })
      .expect(201);
    supplyTransferId = supply.body.data.transfer.id as string;
    expect(supply.body.data.transfer.status).toBe('REQUESTED');
    expect(
      await prisma.inventoryMovement.count({
        where: { transferId: supplyTransferId },
      }),
    ).toBe(0);

    const incoming = await request(app.getHttpServer())
      .get(`/api/cedis/incoming-supplies/${supplyTransferId}`)
      .set(auth())
      .expect(200);
    expect(incoming.body.data.status).toBe('PENDING');
    expect(incoming.body.data.origin.id).toBe(cedisLocationId);
    expect(incoming.body.data.destination.id).toBe(branchLocationId);

    const received = await request(app.getHttpServer())
      .post(`/api/cedis/incoming-supplies/${supplyTransferId}/receive`)
      .set(auth())
      .set('Idempotency-Key', `${marker}:receive`)
      .send({
        expectedCycleVersion: incoming.body.data.cycleVersion,
        items: incoming.body.data.items.map(
          (item: {
            transferItemId: string;
            quantityKg: number;
            quantityPieces: number;
          }) => ({
            transferItemId: item.transferItemId,
            quantityKg: item.quantityKg,
            quantityPieces: item.quantityPieces,
          }),
        ),
      })
      .expect(201);
    expect(received.body.data.status).toBe('RECEIVED');

    const movements = await prisma.inventoryMovement.findMany({
      where: { transferId: supplyTransferId },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: InventoryMovementType.TRANSFER_OUT,
          locationId: cedisLocationId,
        }),
        expect.objectContaining({
          type: InventoryMovementType.TRANSFER_IN,
          locationId: branchLocationId,
        }),
      ]),
    );

    const balances = await prisma.inventoryBalance.findMany({
      where: {
        productId,
        locationId: { in: [cedisLocationId, branchLocationId] },
      },
    });
    const cedisBalance = balances.find(
      (balance) => balance.locationId === cedisLocationId,
    );
    const branchBalance = balances.find(
      (balance) => balance.locationId === branchLocationId,
    );
    expect(Number(cedisBalance?.quantityKg)).toBe(5);
    expect(Number(cedisBalance?.reservedQuantityKg)).toBe(0);
    expect(Number(branchBalance?.quantityKg)).toBe(supplyQuantityKg);
    expect(Number(branchBalance?.reservedQuantityKg)).toBe(0);

    const cycle = await request(app.getHttpServer())
      .get(`${cyclePath}/${cycleId}`)
      .set(auth())
      .expect(200);
    expect(cycle.body.data).toEqual(
      expect.objectContaining({
        branchLocationId,
        distributionCenterLocationId: cedisLocationId,
        confirmedSupplyCount: 1,
      }),
    );
    expect(cycle.body.data.supplies[0].transfer).toEqual(
      expect.objectContaining({
        id: supplyTransferId,
        originLocationId: cedisLocationId,
        destinationLocationId: branchLocationId,
        status: 'CONFIRMED',
      }),
    );

    const dashboard = await request(app.getHttpServer())
      .get('/api/cedis/dashboard')
      .query({ cedisLocationId, businessDate })
      .set(auth())
      .expect(200);
    expect(
      dashboard.body.data.items.some(
        (item: { branch: { id: string } }) =>
          item.branch.id === branchLocationId,
      ),
    ).toBe(true);
  });

  afterAll(async () => {
    await app?.close();
  });
});
