import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ObjectStorageService } from '../src/modules/object-storage/object-storage.service';

type TenantName = 'A' | 'B';

type TenantPlane = {
  name: TenantName;
  apiUrl: string;
  databaseUrl: string;
  storageUrl: string;
  storageBucket: string;
  storageAccessKeyId: string;
  storageSecretAccessKey: string;
  bootstrapPassword: string;
  adminPassword: string;
  cedisCode: string;
  locationCode: string;
};

type ApiLogin = { data?: { accessToken?: unknown } };

function requiredEnvironmentValue(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required integration setting: ${key}`);
  return value;
}

function readTenantPlane(name: TenantName): TenantPlane {
  const prefix = `MTE_TENANT_${name}`;
  return {
    name,
    apiUrl: requiredEnvironmentValue(`${prefix}_API_URL`),
    databaseUrl: requiredEnvironmentValue(`${prefix}_DATABASE_URL`),
    storageUrl: requiredEnvironmentValue(`${prefix}_OBJECT_STORAGE_URL`),
    storageBucket: requiredEnvironmentValue(`${prefix}_OBJECT_STORAGE_BUCKET`),
    storageAccessKeyId: requiredEnvironmentValue(
      `${prefix}_OBJECT_STORAGE_ACCESS_KEY_ID`,
    ),
    storageSecretAccessKey: requiredEnvironmentValue(
      `${prefix}_OBJECT_STORAGE_SECRET_ACCESS_KEY`,
    ),
    bootstrapPassword: requiredEnvironmentValue(
      `${prefix}_BOOTSTRAP_PASSWORD`,
    ),
    adminPassword: requiredEnvironmentValue(`${prefix}_ADMIN_PASSWORD`),
    cedisCode: requiredEnvironmentValue(`${prefix}_CEDIS_CODE`),
    locationCode: requiredEnvironmentValue(`${prefix}_LOCATION_CODE`),
  };
}

const runId = requiredEnvironmentValue('MTE_ISOLATION_RUN_ID');
const adminEmail = requiredEnvironmentValue('MTE_ADMIN_EMAIL');
const driverPassword = requiredEnvironmentValue('MTE_DRIVER_PASSWORD');
const tenantA = readTenantPlane('A');
const tenantB = readTenantPlane('B');

const prismaA = new PrismaClient({
  datasources: { db: { url: tenantA.databaseUrl } },
});
const prismaB = new PrismaClient({
  datasources: { db: { url: tenantB.databaseUrl } },
});

const prefix = `mte005-${runId}`;
const sharedCustomerNumber = `${prefix}-customer`;
const sharedSku = `${prefix}-sku`;
const saleNumberA = `${prefix}-a-sale`;
const paymentIdA = `${prefix}-a-payment`;
const routeIdA = `${prefix}-a-route`;
const deliveryOrderIdA = `${prefix}-a-delivery`;
const fleetEventIdA = `${prefix}-a-position`;
const objectKeyA = `${prefix}/tenant-a-evidence.txt`;

let adminTokenA = '';
let adminTokenB = '';
let cedisIdA = '';
let saleIdA = '';
let vehicleIdA = '';
let driverEmailA = '';

async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error('Disposable data-plane HTTP request failed');
  }
}

async function login(
  plane: TenantPlane,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(`${plane.apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Tenant ${plane.name} login failed: ${response.status}`);
  }

  let payload: ApiLogin;
  try {
    payload = (await response.json()) as ApiLogin;
  } catch {
    throw new Error(`Tenant ${plane.name} login returned invalid JSON`);
  }
  const token = payload.data?.accessToken;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`Tenant ${plane.name} login did not issue an access token`);
  }
  return token;
}

async function changeInitialAdminPassword(plane: TenantPlane): Promise<string> {
  const initialToken = await login(
    plane,
    adminEmail,
    plane.bootstrapPassword,
  );
  const response = await request(`${plane.apiUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${initialToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      currentPassword: plane.bootstrapPassword,
      newPassword: plane.adminPassword,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Tenant ${plane.name} initial password rotation failed: ${response.status}`,
    );
  }
  return login(plane, adminEmail, plane.adminPassword);
}

async function authorizedRequest(
  plane: TenantPlane,
  path: string,
  token: string,
  method = 'GET',
  body?: unknown,
): Promise<Response> {
  return request(`${plane.apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function createAOnlyFixtures(customerId: string) {
  const admin = await prismaA.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, operationalLocationId: true, cedisLocationId: true },
  });
  if (!admin?.cedisLocationId) {
    throw new Error('Tenant A bootstrap fixture is incomplete');
  }
  const [cedis, branch] = await Promise.all([
    prismaA.operationalLocation.findUnique({
      where: { code: tenantA.cedisCode },
      select: { id: true },
    }),
    prismaA.operationalLocation.findUnique({
      where: { code: tenantA.locationCode },
      select: { id: true },
    }),
  ]);
  if (
    !cedis ||
    !branch ||
    cedis.id !== admin.cedisLocationId ||
    branch.id !== admin.operationalLocationId
  ) {
    throw new Error('Tenant A bootstrap locations do not match their manifest');
  }
  cedisIdA = cedis.id;

  const routeStock = await prismaA.operationalLocation.create({
    data: {
      name: `Tenant A ${runId} route stock`,
      code: `${prefix}-a-route-stock`,
      type: 'ROUTE_STOCK',
      parentId: cedisIdA,
      address: 'Disposable multi-company isolation fixture',
      latitude: 19.1738,
      longitude: -96.1342,
    },
  });
  const vehicle = await prismaA.vehicle.create({
    data: {
      code: `${prefix}-a-vehicle`,
      displayName: `Tenant A ${runId} vehicle`,
      homeLocationId: cedisIdA,
    },
  });
  vehicleIdA = vehicle.id;

  const driverRole = await prismaA.role.findUnique({
    where: { name: 'DRIVER' },
    select: { id: true },
  });
  if (!driverRole) throw new Error('Tenant A DRIVER role was not bootstrapped');

  driverEmailA = `mte-driver-${runId}@example.test`;
  const hashedDriverPassword = await bcrypt.hash(driverPassword, 12);
  const driver = await prismaA.user.create({
    data: {
      name: `Tenant A ${runId} driver`,
      email: driverEmailA,
      controlNumber: `${prefix}-a-driver`,
      phone: `${prefix}-a-driver-phone`,
      passwordHash: hashedDriverPassword,
      roleId: driverRole.id,
      operationalLocationId: admin.operationalLocationId,
      cedisLocationId: cedisIdA,
      isActive: true,
      mustChangePassword: false,
    },
    select: { id: true },
  });

  const now = new Date();
  await prismaA.deliveryRoute.create({
    data: {
      id: routeIdA,
      name: `Tenant A ${runId} route`,
      type: 'SALE_DELIVERY',
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: 'IN_PROGRESS',
      scheduledDate: now,
      originLocationId: cedisIdA,
      routeStockLocationId: routeStock.id,
      startedAt: now,
    },
  });

  const sale = await prismaA.sale.create({
    data: {
      id: `${prefix}-a-sale-id`,
      saleNumber: saleNumberA,
      customerId,
      userId: admin.id,
      locationId: routeStock.id,
      saleChannel: 'ROUTE',
      documentType: 'SIMPLE_NOTE',
      routeId: routeIdA,
      subtotal: 10,
      total: 10,
      paymentType: 'CASH_SALE',
      status: 'CONFIRMED',
    },
    select: { id: true },
  });
  saleIdA = sale.id;

  await prismaA.payment.create({
    data: {
      id: paymentIdA,
      saleId: sale.id,
      customerId,
      userId: admin.id,
      amount: 10,
      paymentMethod: 'CASH',
      operationalLocationId: routeStock.id,
      status: 'REGISTERED',
    },
  });

  await prismaA.deliveryOrder.create({
    data: {
      id: deliveryOrderIdA,
      routeId: routeIdA,
      saleId: sale.id,
      status: 'PENDING',
      deliveryAddress: 'Disposable Tenant A delivery address',
      stopSequence: 1,
    },
  });

}

function createObjectStorageService(plane: TenantPlane): ObjectStorageService {
  const values: Record<string, string | boolean | number> = {
    OBJECT_STORAGE_BUCKET: plane.storageBucket,
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ENDPOINT: plane.storageUrl,
    OBJECT_STORAGE_PUBLIC_ENDPOINT: plane.storageUrl,
    OBJECT_STORAGE_ACCESS_KEY_ID: plane.storageAccessKeyId,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: plane.storageSecretAccessKey,
    OBJECT_STORAGE_FORCE_PATH_STYLE: true,
    OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: 120,
  };
  const config = {
    get<T = unknown>(key: string): T | undefined {
      return values[key] as T | undefined;
    },
  } as ConfigService;
  return new ObjectStorageService(config);
}

beforeAll(async () => {
  const readyA = await request(`${tenantA.apiUrl}/api/health/ready`);
  const readyB = await request(`${tenantB.apiUrl}/api/health/ready`);
  if (!readyA.ok || !readyB.ok) {
    throw new Error('Both disposable backend processes must be ready');
  }

  const [identityA, identityB] = await Promise.all([
    prismaA.$queryRaw<Array<{ systemIdentifier: string; postgis: string }>>`
      SELECT system_identifier::text AS "systemIdentifier",
             postgis_full_version() AS postgis
        FROM pg_control_system()
    `,
    prismaB.$queryRaw<Array<{ systemIdentifier: string; postgis: string }>>`
      SELECT system_identifier::text AS "systemIdentifier",
             postgis_full_version() AS postgis
        FROM pg_control_system()
    `,
  ]);
  if (
    !identityA[0]?.systemIdentifier ||
    !identityB[0]?.systemIdentifier ||
    identityA[0].systemIdentifier === identityB[0].systemIdentifier ||
    !identityA[0].postgis.includes('POSTGIS') ||
    !identityB[0].postgis.includes('POSTGIS')
  ) {
    throw new Error('The two PostgreSQL/PostGIS clusters are not independent');
  }

  adminTokenA = await changeInitialAdminPassword(tenantA);
  adminTokenB = await changeInitialAdminPassword(tenantB);

  const [adminA, adminB] = await Promise.all([
    prismaA.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    }),
    prismaB.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    }),
  ]);
  if (!adminA || !adminB) {
    throw new Error('Both bootstrapped administrator records are required');
  }
  const [customerA, customerB, productA, productB] = await Promise.all([
    prismaA.customer.create({
      data: {
        customerNumber: sharedCustomerNumber,
        name: `Tenant A ${runId} customer`,
        customerType: 'RETAIL',
      },
      select: { id: true },
    }),
    prismaB.customer.create({
      data: {
        customerNumber: sharedCustomerNumber,
        name: `Tenant B ${runId} customer`,
        customerType: 'RETAIL',
      },
      select: { id: true },
    }),
    prismaA.product.create({
      data: {
        name: `Tenant A ${runId} product`,
        sku: sharedSku,
        presentationType: 'WHOLE',
        salePrice: 10,
        purchaseCost: 5,
        unit: 'PIECE',
      },
      select: { id: true },
    }),
    prismaB.product.create({
      data: {
        name: `Tenant B ${runId} product`,
        sku: sharedSku,
        presentationType: 'WHOLE',
        salePrice: 10,
        purchaseCost: 5,
        unit: 'PIECE',
      },
      select: { id: true },
    }),
  ]);
  if (
    customerA.id === customerB.id ||
    productA.id === productB.id ||
    tenantA.databaseUrl === tenantB.databaseUrl
  ) {
    throw new Error('Tenant fixtures did not use separate database identities');
  }
  await createAOnlyFixtures(customerA.id);
});

afterAll(async () => {
  await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
});

describe('MTE-005 real two-company data-plane isolation', () => {
  it('allows the same email in independent databases', async () => {
    const [userA, userB] = await Promise.all([
      prismaA.user.findUnique({ where: { email: adminEmail } }),
      prismaB.user.findUnique({ where: { email: adminEmail } }),
    ]);
    expect(userA?.email).toBe(adminEmail);
    expect(userB?.email).toBe(adminEmail);
    expect(userA?.id).not.toBe(userB?.id);
  });

  it('allows the same customerNumber in independent databases', async () => {
    const [customerA, customerB] = await Promise.all([
      prismaA.customer.findUnique({
        where: { customerNumber: sharedCustomerNumber },
      }),
      prismaB.customer.findUnique({
        where: { customerNumber: sharedCustomerNumber },
      }),
    ]);
    expect(customerA).not.toBeNull();
    expect(customerB).not.toBeNull();
    expect(customerA?.id).not.toBe(customerB?.id);
  });

  it('allows the same SKU in independent databases', async () => {
    const [productA, productB] = await Promise.all([
      prismaA.product.findUnique({ where: { sku: sharedSku } }),
      prismaB.product.findUnique({ where: { sku: sharedSku } }),
    ]);
    expect(productA).not.toBeNull();
    expect(productB).not.toBeNull();
    expect(productA?.id).not.toBe(productB?.id);
  });

  it('keeps a sale created in A out of B', async () => {
    const saleA = await prismaA.sale.findUnique({
      where: { saleNumber: saleNumberA },
      select: { id: true },
    });
    const saleB = await prismaB.sale.findUnique({
      where: { saleNumber: saleNumberA },
      select: { id: true },
    });
    expect(saleA?.id).toBe(saleIdA);
    expect(saleB).toBeNull();

    const responseA = await authorizedRequest(
      tenantA,
      `/api/sales/${saleIdA}`,
      adminTokenA,
    );
    const responseB = await authorizedRequest(
      tenantB,
      `/api/sales/${saleIdA}`,
      adminTokenB,
    );
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(404);
  });

  it('keeps a payment created in A out of B', async () => {
    const [paymentA, paymentB] = await Promise.all([
      prismaA.payment.findUnique({ where: { id: paymentIdA } }),
      prismaB.payment.findUnique({ where: { id: paymentIdA } }),
    ]);
    expect(paymentA).not.toBeNull();
    expect(paymentB).toBeNull();
  });

  it('keeps delivery and fleet records created in A out of B', async () => {
    const driverToken = await login(tenantA, driverEmailA, driverPassword);
    const positionResponse = await authorizedRequest(
      tenantA,
      '/api/fleet/positions',
      driverToken,
      'POST',
      {
        clientEventId: fleetEventIdA,
        latitude: 19.1738,
        longitude: -96.1342,
        recordedAt: new Date().toISOString(),
      },
    );
    expect(positionResponse.status).toBe(201);

    const [orderA, orderB, routeA, routeB, positionA, positionB] =
      await Promise.all([
        prismaA.deliveryOrder.findUnique({
          where: { id: deliveryOrderIdA },
          select: { id: true },
        }),
        prismaB.deliveryOrder.findUnique({
          where: { id: deliveryOrderIdA },
          select: { id: true },
        }),
        prismaA.deliveryRoute.findUnique({
          where: { id: routeIdA },
          select: { id: true },
        }),
        prismaB.deliveryRoute.findUnique({
          where: { id: routeIdA },
          select: { id: true },
        }),
        prismaA.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "VehiclePosition"
           WHERE "clientEventId" = ${fleetEventIdA}
             AND "vehicleId" = ${vehicleIdA}
        `,
        prismaB.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "VehiclePosition"
           WHERE "clientEventId" = ${fleetEventIdA}
             AND "vehicleId" = ${vehicleIdA}
        `,
      ]);
    expect(orderA?.id).toBe(deliveryOrderIdA);
    expect(orderB).toBeNull();
    expect(routeA?.id).toBe(routeIdA);
    expect(routeB).toBeNull();
    expect(positionA).toHaveLength(1);
    expect(positionB).toHaveLength(0);

    const responseA = await authorizedRequest(
      tenantA,
      `/api/delivery-routes/${routeIdA}`,
      adminTokenA,
    );
    const responseB = await authorizedRequest(
      tenantB,
      `/api/delivery-routes/${routeIdA}`,
      adminTokenB,
    );
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(404);
  });

  it('rejects a token issued by A when presented to B', async () => {
    const responseA = await authorizedRequest(
      tenantA,
      '/api/auth/me',
      adminTokenA,
    );
    const responseB = await authorizedRequest(
      tenantB,
      '/api/auth/me',
      adminTokenB,
    );
    const crossTenantResponse = await authorizedRequest(
      tenantB,
      '/api/auth/me',
      adminTokenA,
    );
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(crossTenantResponse.status).toBe(401);
  });

  it('cannot consume A signed object through B Object Storage', async () => {
    const storageA = createObjectStorageService(tenantA);
    const storageB = createObjectStorageService(tenantB);
    const body = `MTE isolation object ${runId}`;
    try {
      await storageA.putObject({
        key: objectKeyA,
        body: Buffer.from(body),
        contentType: 'text/plain',
      });
    } catch {
      throw new Error('Tenant A Object Storage write failed');
    }

    let signedUrl: string;
    try {
      signedUrl = await storageA.getDownloadUrl(objectKeyA, 120);
    } catch {
      throw new Error('Tenant A signed URL generation failed');
    }
    const responseA = await request(signedUrl);
    expect(responseA.status).toBe(200);
    expect(await responseA.text()).toBe(body);

    const requestToB = new URL(signedUrl);
    requestToB.port = new URL(tenantB.storageUrl).port;
    const responseB = await request(requestToB.toString());
    expect(responseB.ok).toBe(false);

    const tenantBUrl = await storageB.getDownloadUrl(objectKeyA, 120);
    const responseForBResource = await request(tenantBUrl);
    expect(responseForBResource.ok).toBe(false);
  });
});
