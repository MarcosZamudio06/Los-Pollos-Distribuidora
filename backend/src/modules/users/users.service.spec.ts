import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from './users.service';
import { PERMISSION_DEFINITIONS } from '../../common/authorization/permissions';
const actor = {
  id: 'fixture-security-admin',
  authSessionId: 'fixture-admin-session',
} as never;

const now = new Date('2026-07-11T00:00:00.000Z');
const role = { id: 'role-seller', name: 'SELLER' };
const warehouseRole = { id: 'role-warehouse', name: 'WAREHOUSE' };
const location = {
  id: 'location-1',
  name: 'Matriz',
  type: 'BRANCH',
  isActive: true,
};
const cedisLocation = {
  id: 'cedis-1',
  name: 'CEDIS Veracruz',
  type: 'DISTRIBUTION_CENTER',
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

type PersistedFixtureUser = ReturnType<typeof user> & {
  role: { permissions?: [] };
};

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
    authSession: {
      updateMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        userId: 'fixture-security-admin',
        revokedAt: null,
        lastUsedAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 86400000),
      }),
    },
    accessControlAuditLog: { create: jest.fn() },
    $executeRaw: jest.fn(),
    role: {
      findUnique: jest.fn().mockResolvedValue(role),
      findMany: jest.fn(),
    },
    operationalLocation: { findUnique: jest.fn() },
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 1 }]),
    $transaction: jest.fn((callback: (value: unknown) => unknown) =>
      callback({
        ...prisma,
        user: {
          ...prisma.user,
          findUnique: (args: { where: Record<string, unknown> }) =>
            args.where.id === 'fixture-security-admin'
              ? Promise.resolve({
                  id: 'fixture-security-admin',
                  isActive: true,
                  role: {
                    name: 'ADMIN',
                    permissions: PERMISSION_DEFINITIONS.map(({ key }) => ({
                      permission: { key },
                    })),
                  },
                })
              : prisma.user
                  .findUnique(args)
                  .then((u: PersistedFixtureUser | null) =>
                    u?.role
                      ? {
                          ...u,
                          role: {
                            ...u.role,
                            permissions: u.role.permissions ?? [],
                          },
                        }
                      : u,
                  ),
        },
        role: {
          ...prisma.role,
          findUnique: async (args: { where: Record<string, unknown> }) => {
            const role = await prisma.role.findUnique(args);
            return role
              ? { ...role, permissions: role.permissions ?? [] }
              : null;
          },
        },
      }),
    ),
  };
  return prisma;
}

describe('UsersService employee administration', () => {
  it('requires the dedicated access-profile flow for role changes', async () => {
    const prisma = prismaMock();
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(
      service.update('user-1', { roleId: 'role-admin' }, actor),
    ).rejects.toThrow(
      'Use the access-profile endpoint to change a user profile',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an employee with a generated one-time password and safe persisted fields', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique.mockResolvedValue(location);
    prisma.user.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(user(data)),
    );
    const service = new UsersService(prisma as unknown as PrismaService);

    const result = await service.create(
      {
        name: 'Ana',
        email: ' ANA@POLLOS.LOCAL ',
        phone: '+52 229-123-4567',
        roleId: role.id,
        operationalLocationId: location.id,
      },
      actor,
    );

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
      service.create(
        {
          name: 'Ana',
          email: 'ana@pollos.local',
          phone: '2291234567',
          roleId: role.id,
          operationalLocationId: location.id,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.user.findUnique.mockReset();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique.mockResolvedValue({
      ...location,
      type: 'WAREHOUSE',
    });
    await expect(
      service.create(
        {
          name: 'Ana',
          email: 'ana@pollos.local',
          phone: '2291234567',
          roleId: role.id,
          operationalLocationId: location.id,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows WAREHOUSE users to be assigned to an active CEDIS', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(warehouseRole);
    prisma.operationalLocation.findUnique.mockResolvedValue(cedisLocation);
    prisma.user.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          user({
            ...data,
            role: warehouseRole,
            roleId: warehouseRole.id,
            operationalLocationId: cedisLocation.id,
            operationalLocation: cedisLocation,
          }),
        ),
    );
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        {
          name: 'Almacén CEDIS',
          email: 'warehouse@pollos.local',
          phone: '+522291234568',
          roleId: warehouseRole.id,
          operationalLocationId: cedisLocation.id,
        },
        actor,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        operationalLocationId: cedisLocation.id,
        role: warehouseRole,
      }),
    );
  });

  it.each(['ADMIN', 'BILLING', 'COLLECTIONS', 'DRIVER', 'SELLER', 'WAREHOUSE'])(
    'allows %s users to use an active CEDIS as their primary location',
    async (roleName) => {
      const prisma = prismaMock();
      const roleForTest = {
        id: `role-${roleName.toLowerCase()}`,
        name: roleName,
      };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(roleForTest);
      prisma.operationalLocation.findUnique.mockResolvedValue(cedisLocation);
      prisma.user.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(
            user({
              ...data,
              role: roleForTest,
              roleId: roleForTest.id,
              operationalLocationId: cedisLocation.id,
              operationalLocation: cedisLocation,
            }),
          ),
      );
      const service = new UsersService(prisma as unknown as PrismaService);

      await expect(
        service.create(
          {
            name: 'Vendedor CEDIS',
            email: `${roleName.toLowerCase()}-cedis@pollos.local`,
            phone: '+522291234572',
            roleId: roleForTest.id,
            operationalLocationId: cedisLocation.id,
          },
          actor,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          operationalLocationId: cedisLocation.id,
          role: roleForTest,
          operationalLocation: cedisLocation,
        }),
      );
    },
  );

  it('allows WAREHOUSE users to be assigned to an active branch', async () => {
    const prisma = prismaMock();
    const branch = {
      ...location,
      id: 'branch-alvarado',
      name: 'Alvarado',
      type: 'BRANCH',
    };
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(warehouseRole);
    prisma.operationalLocation.findUnique.mockResolvedValue(branch);
    prisma.user.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          user({
            ...data,
            role: warehouseRole,
            roleId: warehouseRole.id,
            operationalLocationId: branch.id,
            operationalLocation: branch,
          }),
        ),
    );
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        {
          name: 'Almacén Alvarado',
          email: 'warehouse-alvarado@pollos.local',
          phone: '+522291234569',
          roleId: warehouseRole.id,
          operationalLocationId: branch.id,
        },
        actor,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        operationalLocationId: branch.id,
        role: warehouseRole,
        operationalLocation: branch,
      }),
    );
  });

  it('persists an optional CEDIS assignment alongside the primary location', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce(location)
      .mockResolvedValueOnce(cedisLocation);
    prisma.user.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          user({
            ...data,
            cedisLocationId: cedisLocation.id,
            cedisLocation,
          }),
        ),
    );
    const service = new UsersService(prisma as unknown as PrismaService);

    const result = await service.create(
      {
        name: 'Ana CEDIS',
        email: 'ana-cedis@pollos.local',
        phone: '+522291234570',
        roleId: role.id,
        operationalLocationId: location.id,
        cedisLocationId: cedisLocation.id,
      },
      actor,
    );

    expect(result).toEqual(
      expect.objectContaining({
        operationalLocationId: location.id,
        cedisLocationId: cedisLocation.id,
        cedisLocation,
      }),
    );
    expect(prisma.user.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ cedisLocationId: cedisLocation.id }),
    );
  });

  it('rejects an inactive or non-CEDIS additional assignment', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce(location)
      .mockResolvedValueOnce({ ...location, id: 'not-cedis' });
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        {
          name: 'Empleado sin CEDIS',
          email: 'sin-cedis@pollos.local',
          phone: '+522291234571',
          roleId: role.id,
          operationalLocationId: location.id,
          cedisLocationId: 'not-cedis',
        },
        actor,
      ),
    ).rejects.toThrow('CEDIS location is not available for employees');
    expect(prisma.user.create).not.toHaveBeenCalled();
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
      service.create(
        {
          name: 'Ana',
          email: 'ana@pollos.local',
          phone: '2291234567',
          roleId: role.id,
          operationalLocationId: location.id,
        },
        actor,
      ),
    ).rejects.toMatchObject({ message: 'Phone is already registered' });
  });

  it('uses the database sequence for unique concurrent control numbers', async () => {
    const prisma = prismaMock();
    let sequence = 0;
    prisma.$queryRawUnsafe.mockImplementation(() => [{ value: ++sequence }]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.operationalLocation.findUnique.mockResolvedValue(location);
    prisma.user.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(user({ ...data, id: String(data.controlNumber) })),
    );
    const service = new UsersService(prisma as unknown as PrismaService);
    const created = await Promise.all(
      [1, 2].map((index) =>
        service.create(
          {
            name: `Empleado ${index}`,
            email: `employee${index}@pollos.local`,
            phone: `229123456${index}`,
            roleId: role.id,
            operationalLocationId: location.id,
          },
          actor,
        ),
      ),
    );
    expect(created.map((item) => item.controlNumber).sort()).toEqual([
      'EPDP-000001',
      'EPDP-000002',
    ]);
  });

  it('revokes active sessions when an administrator resets a password', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(user());
    prisma.user.update.mockResolvedValue(user({ mustChangePassword: true }));
    prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    const service = new UsersService(prisma as unknown as PrismaService);

    await service.updatePassword(
      'user-1',
      {
        temporaryPassword: 'temporary-password',
      },
      actor,
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionVersion: { increment: 1 } }),
      }),
    );
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
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
