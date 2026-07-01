import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OperationalConfigService } from './operational-config.service';

type ConfigRecord = {
  id: string;
  key: string;
  value: string;
  valueType: string;
  scope: string;
  locationId: string | null;
  description: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  isActive: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockPrisma = {
  operationalConfig: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  operationalLocation: { findFirst: jest.Mock };
};

const now = new Date('2026-06-19T12:00:00.000Z');
const user = { id: 'admin-1', email: 'admin@pollos.local', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

function config(overrides: Partial<ConfigRecord> = {}): ConfigRecord {
  return {
    id: 'config-1',
    key: 'REPORT_REFRESH_INTERVAL_SECONDS',
    value: '60',
    valueType: 'NUMBER',
    scope: 'GLOBAL',
    locationId: null,
    description: 'Report freshness',
    effectiveFrom: now,
    effectiveTo: null,
    isActive: true,
    createdByUserId: 'admin-1',
    updatedByUserId: 'admin-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  return {
    operationalConfig: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    operationalLocation: { findFirst: jest.fn() },
  };
}

describe('OperationalConfigService', () => {
  it('creates auditable allowed operational config and enforces location scope', async () => {
    const prisma = createPrisma();
    const service = new OperationalConfigService(prisma as unknown as PrismaService);
    prisma.operationalLocation.findFirst.mockResolvedValueOnce({ id: 'loc-1', isActive: true });
    prisma.operationalConfig.create.mockImplementation(({ data }) => Promise.resolve(config(data)));

    await expect(
      service.create(
        { key: 'REQUIRED_DELIVERY_EVIDENCE', value: 'PHOTO', valueType: 'STRING', scope: 'LOCATION', locationId: 'loc-1', effectiveFrom: '2026-06-19' },
        user,
      ),
    ).resolves.toMatchObject({ key: 'REQUIRED_DELIVERY_EVIDENCE', scope: 'LOCATION', locationId: 'loc-1', createdByUserId: 'admin-1', updatedByUserId: 'admin-1' });

    expect(prisma.operationalConfig.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: 'REQUIRED_DELIVERY_EVIDENCE', locationId: 'loc-1', createdByUserId: 'admin-1', updatedByUserId: 'admin-1' }) });
  });

  it('rejects structural invariant changes and invalid operational values before writing', async () => {
    const prisma = createPrisma();
    const service = new OperationalConfigService(prisma as unknown as PrismaService);

    await expect(service.create({ key: 'DISABLE_LOCATION_INVENTORY', value: 'true', valueType: 'BOOLEAN', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'DISABLE_ACCOUNTS_RECEIVABLE_FOR_CREDIT', value: 'true', valueType: 'BOOLEAN', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'DISABLE_INVENTORY_TRANSFERS', value: 'true', valueType: 'BOOLEAN', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'USE_INTERNAL_TICKET_AS_ONLY_MVP_DOCUMENT', value: 'true', valueType: 'BOOLEAN', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'DRIVER_OFFLINE_POLICY', value: 'ALLOW', valueType: 'STRING', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'REPORT_REFRESH_INTERVAL_SECONDS', value: '61', valueType: 'NUMBER', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'REPORT_REFRESH_INTERVAL_SECONDS', value: 'abc', valueType: 'NUMBER', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'DEFAULT_SALE_STOCK_LOCATION_STRATEGY', value: 'GLOBAL_STOCK', valueType: 'STRING', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'ROUNDING_MODE', value: 'HALF_UP', valueType: 'STRING', scope: 'LOCATION', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'ROUNDING_MODE', value: 'HALF_UP', valueType: 'STRING', scope: 'GLOBAL', effectiveFrom: 'bad-date' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ key: 'ROUNDING_MODE', value: 'HALF_UP', valueType: 'STRING', scope: 'GLOBAL', effectiveFrom: '2026-06-20', effectiveTo: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.operationalConfig.create).not.toHaveBeenCalled();
  });

  it('updates audit user and soft-deactivates without physical delete', async () => {
    const prisma = createPrisma();
    const service = new OperationalConfigService(prisma as unknown as PrismaService);
    prisma.operationalConfig.findFirst.mockResolvedValueOnce(config());
    prisma.operationalConfig.update.mockResolvedValueOnce(config({ value: '45', updatedByUserId: 'admin-1' }));

    await expect(service.update('config-1', { value: '45' }, user)).resolves.toMatchObject({ value: '45', updatedByUserId: 'admin-1' });
    expect(prisma.operationalConfig.update).toHaveBeenCalledWith({ where: { id: 'config-1' }, data: expect.objectContaining({ value: '45', updatedByUserId: 'admin-1' }) });

    prisma.operationalConfig.findFirst.mockResolvedValueOnce(null);
    await expect(service.update('missing', { value: '30' }, user)).rejects.toBeInstanceOf(NotFoundException);

    prisma.operationalConfig.findFirst.mockResolvedValueOnce(config());
    prisma.operationalConfig.update.mockResolvedValueOnce(config({ isActive: false }));
    await expect(service.deactivate('config-1', user)).resolves.toMatchObject({ isActive: false });
    expect(prisma.operationalConfig.update).toHaveBeenLastCalledWith({ where: { id: 'config-1' }, data: { isActive: false, updatedByUserId: 'admin-1' } });
  });
});
