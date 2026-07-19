import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from './users.service';

const now = new Date('2026-07-11T00:00:00.000Z');
const role = { id: 'role-seller', name: 'SELLER' };
const location = {
  id: 'location-1',
  name: 'Matriz',
  type: 'BRANCH',
  isActive: true,
};

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@pollos.local',
    phone: '+522291234567',
    controlNumber: 'EPDP-000001',
    passwordHash: 'hash',
    roleId: role.id,
    operationalLocationId: location.id,
    role,
    operationalLocation: location,
    isActive: true,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
    deactivatedAt: null,
    deactivatedByUserId: null,
    deactivationReason: null,
    ...overrides,
  };
}

function prismaMock() {
  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    role: { findUnique: jest.fn(), findMany: jest.fn() },
    operationalLocation: { findUnique: jest.fn() },
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 1 }]),
    $transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  return prisma;
}

describe('UsersService employee administration', () => {
  it('creates an employee with a generated one-time password and safe persisted fields', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique.mockResolvedValue(location);
    prisma.user.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => user(data),
    );
    const service = new UsersService(prisma as unknown as PrismaService);

    const result = await service.create({
      name: 'Ana',
      email: ' ANA@POLLOS.LOCAL ',
      phone: '+52 229-123-4567',
      roleId: role.id,
      operationalLocationId: location.id,
    });

    expect(result.controlNumber).toBe('EPDP-000001');
    expect(result.temporaryPassword).toHaveLength(16);
    expect(result).not.toHaveProperty('passwordHash');
    const createData = prisma.user.create.mock.calls[0][0].data;
    expect(createData.email).toBe('ana@pollos.local');
    expect(createData.phone).toBe('+522291234567');
    expect(createData.mustChangePassword).toBe(true);
    await expect(
      bcrypt.compare(result.temporaryPassword, createData.passwordHash),
    ).resolves.toBe(true);
  });

  it('rejects duplicate phone and unavailable employee locations', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user());
    const service = new UsersService(prisma as unknown as PrismaService);
    await expect(
      service.create({
        name: 'Ana',
        email: 'ana@pollos.local',
        phone: '2291234567',
        roleId: role.id,
        operationalLocationId: location.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.user.findUnique.mockReset();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique.mockResolvedValue({
      ...location,
      type: 'WAREHOUSE',
    });
    await expect(
      service.create({
        name: 'Ana',
        email: 'ana@pollos.local',
        phone: '2291234567',
        roleId: role.id,
        operationalLocationId: location.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps database unique races to their actual field', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique.mockResolvedValue(location);
    prisma.user.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['phone'] },
    });
    const service = new UsersService(prisma as unknown as PrismaService);
    await expect(
      service.create({
        name: 'Ana',
        email: 'ana@pollos.local',
        phone: '2291234567',
        roleId: role.id,
        operationalLocationId: location.id,
      }),
    ).rejects.toMatchObject({ message: 'Phone is already registered' });
  });

  it('uses the database sequence for unique concurrent control numbers', async () => {
    const prisma = prismaMock();
    let sequence = 0;
    prisma.$queryRawUnsafe.mockImplementation(async () => [
      { value: ++sequence },
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique.mockResolvedValue(location);
    prisma.user.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        user({ ...data, id: String(data.controlNumber) }),
    );
    const service = new UsersService(prisma as unknown as PrismaService);
    const created = await Promise.all(
      [1, 2].map((index) =>
        service.create({
          name: `Empleado ${index}`,
          email: `employee${index}@pollos.local`,
          phone: `229123456${index}`,
          roleId: role.id,
          operationalLocationId: location.id,
        }),
      ),
    );
    expect(created.map((item) => item.controlNumber).sort()).toEqual([
      'EPDP-000001',
      'EPDP-000002',
    ]);
  });

  it('lists employees with combined role, location, status and search filters', async () => {
    const prisma = prismaMock();
    prisma.user.findMany.mockResolvedValue([user()]);
    prisma.user.count.mockResolvedValue(1);
    const service = new UsersService(prisma as unknown as PrismaService);
    const result = await service.findAll({
      page: 2,
      limit: 10,
      status: 'inactive',
      roleId: role.id,
      operationalLocationId: location.id,
      search: 'ana',
    });
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      limit: 10,
      items: [expect.objectContaining({ email: 'ana@pollos.local' })],
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          isActive: false,
          roleId: role.id,
          operationalLocationId: location.id,
        }),
      }),
    );
  });
});
