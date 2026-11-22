import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { InventoryBalanceService } from '../src/modules/inventory/inventory-balance.service';
import { ObjectStorageService } from '../src/modules/object-storage/object-storage.service';
import { assertDisposableE2eEnvironment } from './e2e-environment';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
type Transaction = (
  body: (tx: Prisma.TransactionClient) => Promise<unknown>,
  options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    timeout?: number;
  },
) => Promise<unknown>;

describe('CI003 evidence: real PostgreSQL rollback and S3 compensation', () => {
  const prisma = new PrismaService();
  const writer = new PrismaService();
  const observer = new PrismaService();
  let storage: ObjectStorageService;
  let s3: S3Client;
  let service: DeliveryService;
  let actor: {
    id: string;
    role: string;
    permissions: string[];
    operationalLocationId: string;
  };
  let locationId: string;
  let orderId: string;
  let saleId: string;
  let routeId: string;
  const bucket = () => process.env.OBJECT_STORAGE_BUCKET!;
  const proof = (scenario: string, facts: Record<string, unknown>) =>
    console.log('CI003_PROOF', JSON.stringify({ scenario, ...facts }));
  const capture = () =>
    service.captureEvidence(
      orderId,
      { type: 'PHOTO', value: png, capturedAt: new Date().toISOString() },
      actor,
    );

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    const db = new URL(process.env.DATABASE_URL!);
    const endpoint = new URL(process.env.OBJECT_STORAGE_ENDPOINT!);
    if (
      db.hostname !== '127.0.0.1' ||
      db.pathname !== '/pollos_ci003_e2e' ||
      endpoint.hostname !== '127.0.0.1' ||
      !bucket().startsWith('ci003-')
    )
      throw new Error(
        'CI003 requires its dedicated loopback disposable PostgreSQL and S3',
      );
    const config = new ConfigService({
      OBJECT_STORAGE_BUCKET: bucket(),
      OBJECT_STORAGE_ENDPOINT: endpoint.href,
      OBJECT_STORAGE_PUBLIC_ENDPOINT: endpoint.href,
      OBJECT_STORAGE_REGION: 'us-east-1',
      OBJECT_STORAGE_FORCE_PATH_STYLE: true,
      OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      OBJECT_STORAGE_SECRET_ACCESS_KEY:
        process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    });
    storage = new ObjectStorageService(config);
    s3 = new S3Client({
      endpoint: endpoint.href,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    await s3.send(new CreateBucketCommand({ Bucket: bucket() }));
    const marker = randomUUID();
    const location = await prisma.operationalLocation.create({
      data: { name: marker, code: marker, type: 'ROUTE_STOCK' },
    });
    locationId = location.id;
    const role = await prisma.role.create({ data: { name: marker } });
    const user = await prisma.user.create({
      data: {
        name: marker,
        email: `${marker}@example.test`,
        controlNumber: marker,
        phone: marker,
        passwordHash: 'not-a-login-fixture',
        roleId: role.id,
        operationalLocationId: locationId,
      },
    });
    actor = {
      id: user.id,
      role: 'DRIVER',
      permissions: [],
      operationalLocationId: locationId,
    };
    service = new DeliveryService(
      prisma,
      new InventoryBalanceService(),
      undefined,
      storage,
    );
    // An unrelated object must survive every compensation and prefix check.
    await storage.putObject({
      key: 'control/unchanged',
      body: Buffer.from('control'),
      contentType: 'text/plain',
    });
  }, 30000);

  beforeEach(async () => {
    const marker = randomUUID();
    const stock = await prisma.operationalLocation.create({
      data: { name: marker, code: marker, type: 'ROUTE_STOCK' },
    });
    const sale = await prisma.sale.create({
      data: {
        saleNumber: marker,
        userId: actor.id,
        locationId,
        saleChannel: 'ROUTE',
        documentType: 'INTERNAL_RECEIPT',
        subtotal: 0,
        total: 0,
        paymentType: 'CASH_SALE',
        status: 'CONFIRMED',
      },
    });
    saleId = sale.id;
    const route = await prisma.deliveryRoute.create({
      data: {
        name: marker,
        driverId: actor.id,
        scheduledDate: new Date(),
        routeStockLocationId: stock.id,
        status: 'IN_PROGRESS',
      },
    });
    routeId = route.id;
    const order = await prisma.deliveryOrder.create({
      data: {
        routeId,
        saleId,
        deliveryAddress: 'Disposable concurrency fixture',
      },
    });
    orderId = order.id;
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      prisma.$disconnect(),
      writer.$disconnect(),
      observer.$disconnect(),
    ]);
    s3?.destroy();
  });

  async function absent(key: string) {
    try {
      await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      throw new Error('Object is still readable after compensation');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      });
    }
  }

  async function oracle(expectedRows: number, expectedObjects: number) {
    const rows = await observer.deliveryEvidence.findMany({
      where: { deliveryOrderId: orderId },
    });
    const objects = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: 'evidence/' }),
    );
    const keys = (objects.Contents ?? [])
      .map((item) => item.Key!)
      .filter((key) => key.includes(`/${orderId}/`));
    expect(rows).toHaveLength(expectedRows);
    expect(keys).toHaveLength(expectedObjects);
    expect(rows.map((row) => row.storageKey).sort()).toEqual(
      expectedRows ? [...keys].sort() : [],
    );
    const control = await s3.send(
      new GetObjectCommand({ Bucket: bucket(), Key: 'control/unchanged' }),
    );
    expect(await control.Body!.transformToString()).toBe('control');
    return { rows: rows.length, objects: keys.length, controlUnchanged: true };
  }

  // Execute real SQL; never fabricate a Prisma conflict or replay an HTTP request.
  // The independent writer commits after the evidence snapshot, before sale UPDATE.
  function conflictSchedule(
    mode: 'once' | 'always' | 'cancel' | 'deadlock' | 'after-insert',
  ) {
    const original = prisma.$transaction.bind(prisma) as Transaction;
    const errors: unknown[] = [];
    const attempts = { count: 0 };
    const spy = jest.spyOn(prisma, '$transaction');
    spy.mockImplementation((async (
      body: Parameters<Transaction>[0],
      options: Parameters<Transaction>[1],
    ) => {
      attempts.count++;
      try {
        return await original(async (tx) => {
          const result = await body(
            new Proxy(tx, {
              get(target, property) {
                if (property !== '$executeRaw')
                  return Reflect.get(target, property);
                return async (
                  sql: TemplateStringsArray,
                  ...values: unknown[]
                ) => {
                  if (
                    mode !== 'after-insert' &&
                    sql.join('').includes('UPDATE "Sale"') &&
                    (mode === 'always' || attempts.count === 1)
                  ) {
                    if (mode === 'deadlock') {
                      let acquired!: () => void;
                      let proceed!: () => void;
                      const locked = new Promise<void>((resolve) => {
                        acquired = resolve;
                      });
                      const release = new Promise<void>((resolve) => {
                        proceed = resolve;
                      });
                      const other = writer.$transaction(
                        async (concurrent) => {
                          await concurrent.$executeRaw`SELECT pg_advisory_xact_lock(7003001)`;
                          acquired();
                          await release;
                          await concurrent.$executeRaw`SELECT pg_advisory_xact_lock(7003002)`;
                        },
                        { timeout: 10000 },
                      );
                      await locked;
                      await tx.$executeRaw`SET LOCAL deadlock_timeout = '50ms'`;
                      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7003002)`;
                      // Evidence enters the wait first, so its shorter deadlock timeout detects the cycle.
                      const blocked = target.$executeRaw`SELECT pg_advisory_xact_lock(7003001)`;
                      const pending = Promise.resolve(blocked);
                      const outcome = pending.catch((error: unknown) => {
                        throw error;
                      });
                      proceed();
                      try {
                        await outcome;
                      } finally {
                        await other;
                      }
                    } else {
                      await writer.$executeRaw`UPDATE "Sale" SET "updatedAt" = "updatedAt", "status" = ${mode === 'cancel' ? 'CANCELLED' : 'CONFIRMED'}::"SaleStatus" WHERE "id" = ${saleId}`;
                    }
                  }
                  return target.$executeRaw(sql, ...values);
                };
              },
            }),
          );
          if (mode === 'after-insert' && attempts.count === 1) {
            // Force a real delegate P2034 after DeliveryEvidence INSERT. The
            // failed transaction must roll that INSERT back before retrying.
            const location = await tx.operationalLocation.findUniqueOrThrow({
              where: { id: locationId },
            });
            await writer.$executeRaw`UPDATE "OperationalLocation" SET "updatedAt" = "updatedAt" WHERE "id" = ${locationId}`;
            await tx.operationalLocation.update({
              where: { id: locationId },
              data: { name: location.name },
            });
          }
          return result;
        }, options);
      } catch (error) {
        errors.push(error);
        throw error;
      }
    }) as typeof prisma.$transaction);
    return { attempts, errors };
  }

  it('recovers a real stale-snapshot sale UPDATE with one upload and one durable row', async () => {
    const put = jest.spyOn(storage, 'putObject');
    const del = jest.spyOn(storage, 'deleteObject');
    const schedule = conflictSchedule('once');
    const result = await capture();
    expect(schedule.attempts.count).toBe(2);
    expect(schedule.errors).toEqual([
      expect.objectContaining({
        code: 'P2034',
        meta: expect.objectContaining({ code: '40001' }),
      }),
    ]);
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
    const object = await s3.send(
      new GetObjectCommand({ Bucket: bucket(), Key: result.storageKey! }),
    );
    const bytes = await object.Body!.transformToByteArray();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      result.sha256,
    );
    proof('40001-recovered', {
      attempts: schedule.attempts.count,
      uploads: put.mock.calls.length,
      ...(await oracle(1, 1)),
      checksumVerified: true,
    });
  });

  it('recovers a real PostgreSQL deadlock inside the existing retry budget', async () => {
    const put = jest.spyOn(storage, 'putObject');
    const schedule = conflictSchedule('deadlock');
    await capture();
    expect(schedule.attempts.count).toBe(2);
    expect(schedule.errors).toEqual([
      expect.objectContaining({
        code: 'P2034',
        meta: expect.objectContaining({ code: '40P01' }),
      }),
    ]);
    expect(put).toHaveBeenCalledTimes(1);
    proof('40P01-recovered', {
      attempts: schedule.attempts.count,
      uploads: put.mock.calls.length,
      ...(await oracle(1, 1)),
    });
  }, 15000);

  it('rolls back a completed evidence INSERT on P2034 before retrying, without duplicate rows or objects', async () => {
    const put = jest.spyOn(storage, 'putObject');
    const del = jest.spyOn(storage, 'deleteObject');
    const schedule = conflictSchedule('after-insert');
    await capture();
    expect(schedule.attempts.count).toBe(2);
    expect(schedule.errors).toEqual([
      expect.objectContaining({ code: 'P2034' }),
    ]);
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
    proof('insert-rollback-no-duplicates', {
      attempts: schedule.attempts.count,
      uploads: put.mock.calls.length,
      ...(await oracle(1, 1)),
    });
  });

  it('exhausts three real serialization failures, deletes exactly once and verifies GET 404', async () => {
    const put = jest.spyOn(storage, 'putObject');
    const del = jest.spyOn(storage, 'deleteObject');
    const schedule = conflictSchedule('always');
    await expect(capture()).rejects.toMatchObject({
      response: { code: 'EVIDENCE_CONCURRENCY_CONFLICT' },
    });
    expect(schedule.attempts.count).toBe(3);
    expect(put).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
    const key = put.mock.calls[0][0].key;
    expect(del).toHaveBeenCalledWith(key);
    await absent(key);
    proof('exhausted-compensated', {
      attempts: schedule.attempts.count,
      uploads: put.mock.calls.length,
      deletes: del.mock.calls.length,
      getStatus: 404,
      ...(await oracle(0, 0)),
    });
  });

  it('stops after retry reload sees cancellation, without retrying the business conflict', async () => {
    const put = jest.spyOn(storage, 'putObject');
    const schedule = conflictSchedule('cancel');
    await expect(capture()).rejects.toThrow(
      'Only a confirmed non-cancelled sale can be executed',
    );
    expect(schedule.attempts.count).toBe(2);
    await absent(put.mock.calls[0][0].key);
    expect(
      (await observer.sale.findUniqueOrThrow({ where: { id: saleId } })).status,
    ).toBe('CANCELLED');
    proof('business-conflict', {
      attempts: schedule.attempts.count,
      writerStatePreserved: true,
      getStatus: 404,
      ...(await oracle(0, 0)),
    });
  });

  it('reports cleanup failure explicitly and preserves the original database error', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const put = jest.spyOn(storage, 'putObject');
    // A denied S3 DeleteObject is an injected external failure, not MVCC evidence.
    jest
      .spyOn(storage, 'deleteObject')
      .mockRejectedValue(new Error('injected DeleteObject denial'));
    const schedule = conflictSchedule('always');
    await expect(capture()).rejects.toMatchObject({
      response: { code: 'EVIDENCE_CONCURRENCY_CONFLICT' },
    });
    const key = put.mock.calls[0][0].key;
    expect(schedule.attempts.count).toBe(3);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(key),
      expect.stringContaining('injected DeleteObject denial'),
    );
    const orphan = await s3.send(
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
    );
    expect(await orphan.Body!.transformToByteArray()).toHaveLength(68);
    expect(
      await observer.deliveryEvidence.count({
        where: { deliveryOrderId: orderId },
      }),
    ).toBe(0);
    proof('cleanup-failure-detected', {
      rows: 0,
      orphanReadable: true,
      cleanupFailureLogged: true,
    });
    // Explicit test-owned recovery, never call the mocked production compensation again.
    await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    await absent(key);
    proof('cleanup-failure-repaired-by-test', {
      getStatus: 404,
      ...(await oracle(0, 0)),
    });
  });
});
