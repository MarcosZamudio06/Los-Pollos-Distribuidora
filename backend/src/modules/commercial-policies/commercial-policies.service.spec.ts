import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomerType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CommercialPoliciesService } from './commercial-policies.service';

type PolicyRecord = {
  id: string;
  name: string;
  description: string | null;
  customerType: CustomerType | null;
  priceListId: string | null;
  defaultCreditLimit: { toString(): string } | number | null;
  defaultCreditDays: number | null;
  overdueBlockingMode: string | null;
  creditLimitBlockingMode: string | null;
  allowAdministrativeOverride: boolean;
  isActive: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockPrisma = {
  commercialPolicy: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  accountReceivable: { findFirst: jest.Mock };
  sale: { findFirst: jest.Mock };
};

const now = new Date('2026-06-19T12:00:00.000Z');
const user = { id: 'admin-1', email: 'admin@pollos.local', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

function decimal(value: string) {
  return { toString: () => value };
}

function policy(overrides: Partial<PolicyRecord> = {}): PolicyRecord {
  return {
    id: 'policy-1',
    name: 'Wholesale standard',
    description: 'Base terms',
    customerType: CustomerType.WHOLESALE,
    priceListId: null,
    defaultCreditLimit: decimal('50000'),
    defaultCreditDays: 15,
    overdueBlockingMode: 'BLOCK',
    creditLimitBlockingMode: 'BLOCK',
    allowAdministrativeOverride: true,
    isActive: true,
    effectiveFrom: now,
    effectiveTo: null,
    createdByUserId: 'admin-1',
    updatedByUserId: 'admin-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  return {
    commercialPolicy: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    accountReceivable: { findFirst: jest.fn() },
    sale: { findFirst: jest.fn() },
  };
}

describe('CommercialPoliciesService', () => {
  it('creates auditable policies with non-negative credit terms and blocking modes', async () => {
    const prisma = createPrisma();
    const service = new CommercialPoliciesService(prisma as unknown as PrismaService);
    prisma.commercialPolicy.create.mockImplementation(({ data }) => Promise.resolve(policy(data)));

    await expect(
      service.create(
        {
          name: ' Wholesale standard ',
          description: 'Base terms',
          customerType: CustomerType.WHOLESALE,
          defaultCreditLimit: 50000,
          defaultCreditDays: 15,
          overdueBlockingMode: 'BLOCK',
          creditLimitBlockingMode: 'BLOCK',
          allowAdministrativeOverride: true,
          effectiveFrom: '2026-06-19',
          isActive: true,
        },
        user,
      ),
    ).resolves.toMatchObject({
      id: 'policy-1',
      name: 'Wholesale standard',
      defaultCreditLimit: '50000',
      defaultCreditDays: 15,
      overdueBlockingMode: 'BLOCK',
      creditLimitBlockingMode: 'BLOCK',
      createdByUserId: 'admin-1',
      updatedByUserId: 'admin-1',
    });

    expect(prisma.commercialPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Wholesale standard', defaultCreditLimit: 50000, defaultCreditDays: 15, createdByUserId: 'admin-1', updatedByUserId: 'admin-1' }),
    });
  });

  it('rejects invalid credit terms, missing blocking modes, and invalid vigency before writing', async () => {
    const prisma = createPrisma();
    const service = new CommercialPoliciesService(prisma as unknown as PrismaService);

    await expect(service.create({ name: 'Bad', defaultCreditLimit: -1, effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'Bad', defaultCreditDays: -1, effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'Bad', defaultCreditDays: 15, creditLimitBlockingMode: 'BLOCK', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'Bad', defaultCreditLimit: 1000, overdueBlockingMode: 'BLOCK', effectiveFrom: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'Bad', isActive: true }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'Bad', effectiveFrom: 'bad-date' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'Bad', effectiveFrom: '2026-06-20', effectiveTo: '2026-06-19' }, user)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.commercialPolicy.create).not.toHaveBeenCalled();
  });

  it('preserves historical commercial conditions already applied to sales or receivables', async () => {
    const prisma = createPrisma();
    const service = new CommercialPoliciesService(prisma as unknown as PrismaService);

    prisma.commercialPolicy.findFirst.mockResolvedValueOnce(policy());
    prisma.sale.findFirst.mockResolvedValueOnce({ id: 'sale-1' });
    prisma.accountReceivable.findFirst.mockResolvedValueOnce(null);

    await expect(service.update('policy-1', { defaultCreditDays: 20 }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.commercialPolicy.update).not.toHaveBeenCalled();
  });

  it('updates audit user and soft-deactivates without physical delete', async () => {
    const prisma = createPrisma();
    const service = new CommercialPoliciesService(prisma as unknown as PrismaService);

    prisma.commercialPolicy.findFirst.mockResolvedValueOnce(policy());
    prisma.sale.findFirst.mockResolvedValueOnce(null);
    prisma.accountReceivable.findFirst.mockResolvedValueOnce(null);
    prisma.commercialPolicy.update.mockResolvedValueOnce(policy({ name: 'Updated', updatedByUserId: 'admin-1' }));
    await expect(service.update('policy-1', { name: 'Updated' }, user)).resolves.toMatchObject({ name: 'Updated', updatedByUserId: 'admin-1' });
    expect(prisma.commercialPolicy.update).toHaveBeenCalledWith({ where: { id: 'policy-1' }, data: expect.objectContaining({ name: 'Updated', updatedByUserId: 'admin-1' }) });

    prisma.commercialPolicy.findFirst.mockResolvedValueOnce(null);
    await expect(service.update('missing', { name: 'Nope' }, user)).rejects.toBeInstanceOf(NotFoundException);

    prisma.commercialPolicy.findFirst.mockResolvedValueOnce(policy());
    prisma.sale.findFirst.mockResolvedValueOnce(null);
    prisma.accountReceivable.findFirst.mockResolvedValueOnce(null);
    prisma.commercialPolicy.update.mockResolvedValueOnce(policy({ isActive: false }));
    await expect(service.deactivate('policy-1', user)).resolves.toMatchObject({ isActive: false });
    expect(prisma.commercialPolicy.update).toHaveBeenLastCalledWith({ where: { id: 'policy-1' }, data: { isActive: false, updatedByUserId: 'admin-1' } });
  });
});
