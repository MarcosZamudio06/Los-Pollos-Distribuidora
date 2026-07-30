import { ForbiddenException } from '@nestjs/common';
import {
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
} from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { AccessControlService } from './access-control.service';

const permission = (key: string) => ({
  id: `permission-${key}`,
  key,
  description: key,
});

function roleRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-seller',
    name: 'SELLER',
    description: 'Sales profile',
    version: 4,
    permissions: [
      { permission: permission(PERMISSIONS.ACCESS_PROFILES_MANAGE) },
    ],
    _count: { users: 1 },
    ...overrides,
  };
}

function createPrisma() {
  const prisma = {
    permission: {
      findMany: jest.fn(),
    },
    role: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    rolePermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    authSession: {
      count: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    accessControlAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof prisma) => unknown) => callback(prisma),
    ),
  };
  return prisma;
}

const admin = {
  id: 'admin-1',
  authSessionId: 'session-admin',
  permissions: PERMISSION_DEFINITIONS.map(({ key }) => key),
} as never;

describe('AccessControlService', () => {
  it('updates a canonical profile, revokes affected sessions, and writes an audit record', async () => {
    const prisma = createPrisma();
    const previous = roleRecord({
      permissions: [
        { permission: permission(PERMISSIONS.ACCESS_PROFILES_MANAGE) },
      ],
    });
    const updated = roleRecord({
      version: 5,
      permissions: [
        { permission: permission(PERMISSIONS.ACCESS_PROFILES_MANAGE) },
        { permission: permission(PERMISSIONS.COSTS_READ) },
      ],
    });
    prisma.role.findUnique
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(updated);
    prisma.permission.findMany.mockResolvedValue([
      permission(PERMISSIONS.ACCESS_PROFILES_MANAGE),
      permission(PERMISSIONS.COSTS_READ),
    ]);
    prisma.role.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findMany.mockResolvedValue([{ id: 'employee-1' }]);
    prisma.authSession.count.mockResolvedValue(2);
    prisma.user.count.mockResolvedValue(1);
    prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    prisma.accessControlAuditLog.create.mockResolvedValue({ id: 'audit-1' });

    const result = await new AccessControlService(
      prisma as unknown as PrismaService,
    ).updateRolePermissions(
      'role-seller',
      {
        permissionKeys: [
          PERMISSIONS.ACCESS_PROFILES_MANAGE,
          PERMISSIONS.COSTS_READ,
        ],
        expectedVersion: 4,
        reason: 'Separación de costos',
      },
      admin,
    );

    expect(result).toMatchObject({
      changed: true,
      added: [PERMISSIONS.COSTS_READ],
      affectedUsers: 1,
      activeSessionsBefore: 2,
      revokedSessions: 2,
    });
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-seller' },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['employee-1'] } },
      }),
    );
    expect(prisma.accessControlAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ROLE_PERMISSIONS_UPDATED',
          reason: 'Separación de costos',
          revokedSessionCount: 2,
        }),
      }),
    );
  });

  it('does not let an actor grant a permission they do not possess', async () => {
    const prisma = createPrisma();
    const service = new AccessControlService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.updateRolePermissions(
        'role-seller',
        {
          permissionKeys: [
            PERMISSIONS.ACCESS_PROFILES_MANAGE,
            PERMISSIONS.COSTS_READ,
          ],
          expectedVersion: 4,
          reason: 'Escalamiento no permitido',
        },
        {
          ...admin,
          permissions: [PERMISSIONS.ACCESS_PROFILES_MANAGE],
        } as never,
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        `Cannot grant permission: ${PERMISSIONS.COSTS_READ}`,
      ),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preserves a security administrator when a profile loses security permissions', async () => {
    const prisma = createPrisma();
    prisma.role.findUnique.mockResolvedValue(
      roleRecord({
        permissions: [
          { permission: permission(PERMISSIONS.ACCESS_PROFILES_MANAGE) },
        ],
      }),
    );
    prisma.permission.findMany.mockResolvedValue([]);
    prisma.role.updateMany.mockResolvedValue({ count: 1 });
    prisma.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
    prisma.rolePermission.createMany.mockResolvedValue({ count: 0 });
    prisma.user.findMany.mockResolvedValue([{ id: 'employee-1' }]);
    prisma.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await expect(
      new AccessControlService(
        prisma as unknown as PrismaService,
      ).updateRolePermissions(
        'role-seller',
        {
          permissionKeys: [],
          expectedVersion: 4,
          reason: 'Retirar administración',
        },
        admin,
      ),
    ).rejects.toThrow('At least one active access profile manager is required');

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.accessControlAuditLog.create).not.toHaveBeenCalled();
  });

  it('reassigns a user profile and revokes that user sessions', async () => {
    const prisma = createPrisma();
    const currentRole = {
      id: 'role-seller',
      name: 'SELLER',
      description: 'Sales profile',
      version: 4,
      permissions: [
        { permission: permission(PERMISSIONS.ACCESS_PROFILES_MANAGE) },
      ],
    };
    const nextRole = {
      id: 'role-warehouse',
      name: 'WAREHOUSE',
      description: 'Warehouse profile',
      version: 2,
      permissions: [{ permission: permission(PERMISSIONS.COSTS_READ) }],
    };
    const currentUser = {
      id: 'employee-1',
      name: 'Ana',
      email: 'ana@pollos.local',
      controlNumber: 'EPDP-000001',
      isActive: true,
      roleId: currentRole.id,
      role: currentRole,
    };
    const updatedUser = {
      ...currentUser,
      roleId: nextRole.id,
      role: nextRole,
      operationalLocation: { id: 'location-1', name: 'Matriz', type: 'BRANCH' },
    };
    prisma.user.findUnique.mockResolvedValue(currentUser);
    prisma.role.findUnique.mockResolvedValue(nextRole);
    prisma.user.update.mockResolvedValue(updatedUser);
    prisma.user.findUniqueOrThrow.mockResolvedValue(updatedUser);
    prisma.user.count.mockResolvedValue(1);
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.authSession.findMany.mockResolvedValue([]);
    prisma.accessControlAuditLog.create.mockResolvedValue({ id: 'audit-2' });

    const result = await new AccessControlService(
      prisma as unknown as PrismaService,
    ).updateUserAccessProfile(
      'employee-1',
      {
        roleId: nextRole.id,
        expectedRoleId: currentRole.id,
        reason: 'Cambio de responsabilidad',
      },
      admin,
    );

    expect(result).toMatchObject({ changed: true, revokedSessions: 1 });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-1' },
        data: expect.objectContaining({ roleId: nextRole.id }),
      }),
    );
    expect(prisma.accessControlAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_ACCESS_PROFILE_UPDATED',
        }),
      }),
    );
  });

  it('revokes sessions and audits a manual session closure', async () => {
    const prisma = createPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'employee-1' });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.authSession.updateMany.mockResolvedValue({ count: 3 });
    prisma.accessControlAuditLog.create.mockResolvedValue({ id: 'audit-3' });

    const result = await new AccessControlService(
      prisma as unknown as PrismaService,
    ).revokeUserSessions(
      'employee-1',
      { reason: 'Incidente de seguridad' },
      admin,
    );

    expect(result).toEqual({
      revokedSessions: 3,
      currentSessionRevoked: false,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-1' },
        data: { sessionVersion: { increment: 1 } },
      }),
    );
    expect(prisma.accessControlAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_SESSIONS_REVOKED',
          reason: 'Incidente de seguridad',
        }),
      }),
    );
  });
});
