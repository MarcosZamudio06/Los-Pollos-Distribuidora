import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InventoryMovementType,
  ProductPresentationType,
  ProductUnit,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';
import { PrismaService } from '../src/database/prisma.service';
import { AppModule } from '../src/app.module';
import { AccountsReceivableAgingJob } from '../src/modules/accounts-receivable/accounts-receivable-aging.job';
import { seed } from '../prisma/seed';

const routingEnvironment = {
  OSRM_URL: 'http://localhost:5000',
  PHOTON_URL: 'http://localhost:2322',
  VROOM_URL: 'http://localhost:3000',
} as const;

describe('CEDIS branch supply cycle (e2e)', () => {
  const marker = `e2e-cedis-${randomUUID()}`;
  let businessDate: Date;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let productId: string;
  let cedisLocationId: string;
  let branchLocationId: string;
  let cycleId: string;
  let supplyTransferId: string;
  let activeSupplyTransferId: string;
  let returnTransferId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required for the CEDIS PostgreSQL E2E suite',
      );
    }
    process.env.JWT_ACCESS_SECRET ??=
      'e2e-access-secret-at-least-32-characters';
    process.env.JWT_REFRESH_SECRET ??=
      'e2e-refresh-secret-at-least-32-characters';
    process.env.SWAGGER_ENABLED = 'false';
    Object.assign(process.env, routingEnvironment);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccountsReceivableAgingJob)
      .useValue({ onApplicationBootstrap: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    configureHttpApplication(app, moduleFixture.get(ConfigService));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    await seed(prisma as never);

    const [cedis, branch] = await Promise.all([
      prisma.operationalLocation.findUnique({ where: { code: 'CEDIS-VER' } }),
      prisma.operationalLocation.findUnique({ where: { code: 'VER' } }),
    ]);
    if (!cedis || !branch) throw new Error('Base CEDIS locations are missing');
    cedisLocationId = cedis.id;
    branchLocationId = branch.id;

    for (let day = 0; day < 366; day += 1) {
      const candidate = new Date(Date.UTC(2099, 0, day + 1));
      const existing = await prisma.branchSupplyCycle.findFirst({
        where: {
          branchLocationId,
          businessDate: candidate,
          status: { not: 'CANCELLED' },
        },
        select: { id: true },
      });
      if (!existing) {
        businessDate = candidate;
        break;
      }
    }
    if (!businessDate) throw new Error('No free CEDIS E2E business date');

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

    await prisma.inventoryBalance.createMany({
      data: [
        {
          productId,
          locationId: cedisLocationId,
          quantityKg: 10,
          quantityPieces: 0,
        },
        {
          productId,
          locationId: branchLocationId,
          quantityKg: 0,
          quantityPieces: 0,
        },
      ],
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'dev.admin@pollos.local',
        password: 'DevOnly-ChangeMe-2026!',
      })
      .expect(200);
    accessToken = loginResponse.body.data.accessToken as string;
    expect(loginResponse.body.data.user.permissions).toEqual(
      expect.arrayContaining(['cedis.view']),
    );
  });

  it('confirms a supply and return while preserving inventory and cycle totals', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const cyclePath = '/api/cedis/branch-supply-cycles';

    const opened = await request(app.getHttpServer())
      .post(cyclePath)
      .set(auth)
      .set('Idempotency-Key', `${marker}:open`)
      .send({
        distributionCenterLocationId: cedisLocationId,
        branchLocationId,
        businessDate: businessDate.toISOString().slice(0, 10),
        notes: marker,
      })
      .expect(201);
    cycleId = opened.body.data.id as string;
    expect(opened.body.data.status).toBe('OPEN');

    const supply = await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/supplies`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply`)
      .send({
        expectedVersion: 1,
        items: [{ productId, unit: 'KG', quantityKg: 10 }],
      })
      .expect(201);
    supplyTransferId = supply.body.data.transfer.id as string;
    expect(supply.body.data.transfer.status).toBe('REQUESTED');
    expect(supply.body.data.cycle.version).toBe(2);
    expect(
      await prisma.branchSupplyCycleEvent.count({
        where: {
          branchSupplyCycleId: cycleId,
          type: 'TRANSFER_LINKED',
          cycleVersion: 2,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.branchSupplyCycleProductSnapshot.count({
        where: { branchSupplyCycleId: cycleId, productId },
      }),
    ).toBe(1);
    expect(
      await prisma.inventoryMovement.count({
        where: { transferId: supplyTransferId },
      }),
    ).toBe(0);

    const reservedCedisBalance = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId: cedisLocationId,
        },
      },
    });
    expect(Number(reservedCedisBalance?.quantityKg)).toBe(10);
    expect(Number(reservedCedisBalance?.reservedQuantityKg)).toBe(10);
    expect(
      Number(reservedCedisBalance?.quantityKg) -
        Number(reservedCedisBalance?.reservedQuantityKg),
    ).toBe(0);

    const retriedSupply = await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/supplies`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply`)
      .send({
        expectedVersion: 1,
        items: [{ productId, unit: 'KG', quantityKg: 10 }],
      })
      .expect(201);
    expect(retriedSupply.body.data.transfer.id).toBe(supplyTransferId);
    expect(
      Number(
        (
          await prisma.inventoryBalance.findUnique({
            where: {
              productId_locationId: {
                productId,
                locationId: cedisLocationId,
              },
            },
          })
        )?.reservedQuantityKg,
      ),
    ).toBe(10);
    expect(
      await prisma.branchSupplyCycleEvent.count({
        where: {
          branchSupplyCycleId: cycleId,
          type: 'TRANSFER_LINKED',
          cycleVersion: 2,
        },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/supplies`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply`)
      .send({
        expectedVersion: 1,
        items: [{ productId, unit: 'KG', quantityKg: 9 }],
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('IDEMPOTENCY_CONFLICT');
      });

    await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/supplies`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:insufficient`)
      .send({
        expectedVersion: 2,
        items: [{ productId, unit: 'KG', quantityKg: 1 }],
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('INSUFFICIENT_STOCK');
        expect(body.findings).toEqual([
          expect.objectContaining({
            productId,
            requestedKg: 1,
            availableKg: 0,
            shortageKg: 1,
          }),
        ]);
      });

    expect(
      (
        await prisma.branchSupplyCycle.findUnique({
          where: { id: cycleId },
          select: { version: true },
        })
      )?.version,
    ).toBe(2);
    expect(
      await prisma.branchSupplyCycleTransfer.count({
        where: { branchSupplyCycleId: cycleId },
      }),
    ).toBe(1);

    const cancellationReason = `${marker}:cancel-supply`;
    const cancelledSupply = await request(app.getHttpServer())
      .post(`/api/inventory-transfers/${supplyTransferId}/cancel`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply-cancel`)
      .send({ reason: cancellationReason })
      .expect(201);
    expect(cancelledSupply.body.data.status).toBe('CANCELLED');
    expect(
      await prisma.inventoryMovement.count({
        where: { transferId: supplyTransferId },
      }),
    ).toBe(0);
    const releasedCedisBalance = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId: cedisLocationId,
        },
      },
    });
    expect(Number(releasedCedisBalance?.quantityKg)).toBe(10);
    expect(Number(releasedCedisBalance?.reservedQuantityKg)).toBe(0);
    expect(
      await prisma.branchSupplyCycleEvent.count({
        where: {
          branchSupplyCycleId: cycleId,
          type: 'TRANSFER_STATE_CHANGED',
          cycleVersion: 3,
        },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post(`/api/inventory-transfers/${supplyTransferId}/cancel`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply-cancel`)
      .send({ reason: cancellationReason })
      .expect(201);
    expect(
      await prisma.branchSupplyCycleEvent.count({
        where: {
          branchSupplyCycleId: cycleId,
          type: 'TRANSFER_STATE_CHANGED',
          cycleVersion: 3,
        },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.branchSupplyCycle.findUnique({
          where: { id: cycleId },
          select: { version: true },
        })
      )?.version,
    ).toBe(3);

    await request(app.getHttpServer())
      .post(`/api/inventory-transfers/${supplyTransferId}/cancel`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply-cancel`)
      .send({ reason: `${cancellationReason}:changed` })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('IDEMPOTENCY_CONFLICT');
      });

    const replacementSupply = await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/supplies`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:replacement-supply`)
      .send({
        expectedVersion: 3,
        items: [{ productId, unit: 'KG', quantityKg: 10 }],
      })
      .expect(201);
    activeSupplyTransferId = replacementSupply.body.data.transfer.id as string;
    expect(replacementSupply.body.data.transfer.status).toBe('REQUESTED');
    expect(replacementSupply.body.data.cycle.version).toBe(4);

    const incomingSupply = await request(app.getHttpServer())
      .get(`/api/cedis/incoming-supplies/${activeSupplyTransferId}`)
      .set(auth)
      .expect(200);

    expect(incomingSupply.body.data.status).toBe('PENDING');

    const receiptItems = incomingSupply.body.data.items.map(
      (item: {
        transferItemId: string;
        quantityKg: number;
        quantityPieces: number;
      }) => ({
        transferItemId: item.transferItemId,
        quantityKg: item.quantityKg,
        quantityPieces: item.quantityPieces,
      }),
    );

    const receivedSupply = await request(app.getHttpServer())
      .post(`/api/cedis/incoming-supplies/${activeSupplyTransferId}/receive`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply-receive`)
      .send({
        expectedCycleVersion: incomingSupply.body.data.cycleVersion,
        items: receiptItems,
      })
      .expect(201);

    expect(receivedSupply.body.data.status).toBe('RECEIVED');

    const afterSupply = await request(app.getHttpServer())
      .get(`${cyclePath}/${cycleId}`)
      .set(auth)
      .expect(200);
    expect(afterSupply.body.data.version).toBe(5);
    expect(afterSupply.body.data.confirmedSupplyCount).toBe(1);

    const returned = await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/returns`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:return`)
      .send({
        expectedVersion: 5,
        items: [{ productId, unit: 'KG', quantityKg: 3 }],
      })
      .expect(201);
    returnTransferId = returned.body.data.transfer.id as string;
    expect(returned.body.data.transfer.status).toBe('REQUESTED');
    expect(
      await prisma.inventoryMovement.count({
        where: { transferId: returnTransferId },
      }),
    ).toBe(0);

    await request(app.getHttpServer())
      .post(`/api/inventory-transfers/${returnTransferId}/confirm`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:return-confirm`)
      .expect(201);

    const refreshed = await request(app.getHttpServer())
      .post(`${cyclePath}/${cycleId}/refresh`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:refresh`)
      .send({ expectedVersion: 7 })
      .expect(201);

    expect(refreshed.body.data.confirmedSupplyCount).toBe(1);
    expect(refreshed.body.data.confirmedReturnCount).toBe(1);
    expect(refreshed.body.data.totals.suppliedKg).toBe(10);
    expect(refreshed.body.data.totals.returnedKg).toBe(3);
    expect(refreshed.body.data.totals.netKg).toBe(7);
    expect(refreshed.body.data.totals.expectedSoldKg).toBe(7);

    const movements = await prisma.inventoryMovement.findMany({
      where: {
        transferId: { in: [activeSupplyTransferId, returnTransferId] },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(4);
    expect(movements.map((movement) => movement.type)).toEqual([
      InventoryMovementType.TRANSFER_OUT,
      InventoryMovementType.TRANSFER_IN,
      InventoryMovementType.TRANSFER_OUT,
      InventoryMovementType.TRANSFER_IN,
    ]);

    const balances = await prisma.inventoryBalance.findMany({
      where: {
        productId,
        locationId: { in: [cedisLocationId, branchLocationId] },
      },
      orderBy: { locationId: 'asc' },
    });
    expect(balances.map((balance) => Number(balance.quantityKg))).toEqual(
      expect.arrayContaining([3, 7]),
    );
  });

  afterAll(async () => {
    await app?.close();
  });
});
