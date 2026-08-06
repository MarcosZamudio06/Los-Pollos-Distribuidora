import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CANONICAL_ROLE_NAMES,
  PERMISSION_METADATA,
  PERMISSIONS,
  type Permission,
} from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  ListAccessAuditLogsDto,
  RevokeUserSessionsDto,
  UpdateRolePermissionsDto,
  UpdateUserAccessProfileDto,
} from './dto';

const roleInclude = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

const userAccessInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  operationalLocation: { select: { id: true, name: true, type: true } },
} satisfies Prisma.UserInclude;

type RoleWithAccess = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;
type UserWithAccess = Prisma.UserGetPayload<{
  include: typeof userAccessInclude;
}>;
type AccessClient = Prisma.TransactionClient | PrismaService;
type RequestContext = { requestId?: string; ipAddress?: string };

const EMPLOYEE_LOCATION_TYPES = [
  'BRANCH',
  'WAREHOUSE',
  'DISTRIBUTION_CENTER',
  'MIXED',
  'EXTERNAL_POINT_OF_SALE',
];
const WAREHOUSE_LOCATION_TYPES = [
  'BRANCH',
  'WAREHOUSE',
  'DISTRIBUTION_CENTER',
  'MIXED',
];
const SELLER_LOCATION_TYPES = ['BRANCH', 'MIXED', 'EXTERNAL_POINT_OF_SALE'];

@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly sessionRevocationRegistry?: SessionRevocationRegistry,
  ) {}

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ key: 'asc' }],
    });

    return permissions.map((permission) => ({
      ...permission,
      ...(PERMISSION_METADATA[permission.key as Permission] ?? {
        group: 'Security',
        risk: 'sensitive',
      }),
    }));
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      roles.map(async (role) =>
        this.toRoleResponse(
          role,
          await this.prisma.authSession.count({
            where: { user: { roleId: role.id }, revokedAt: null },
          }),
        ),
      ),
    );
  }

  async getRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!role) throw new NotFoundException('Access profile not found');
    return this.toRoleResponse(
      role,
      await this.prisma.authSession.count({
        where: { user: { roleId: role.id }, revokedAt: null },
      }),
    );
  }

  async updateRolePermissions(
    id: string,
    dto: UpdateRolePermissionsDto,
    actor: AuthenticatedPrincipal,
    context: RequestContext = {},
  ) {
    const permissionKeys = [
      ...new Set(dto.permissionKeys.map((key) => key.trim())),
    ];
    if (permissionKeys.some((key) => !key)) {
      throw new BadRequestException('Permission keys cannot be empty');
    }
    this.assertActorCanGrant(actor, permissionKeys);

    const transactionResult = await this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.role.findUnique({
          where: { id },
          include: { permissions: { include: { permission: true } } },
        });
        if (!current) throw new NotFoundException('Access profile not found');
        this.assertCanonicalRole(current.name);
        if (current.version !== dto.expectedVersion) {
          throw new ConflictException('Access profile version does not match');
        }

        const permissions = await transaction.permission.findMany({
          where: { key: { in: permissionKeys } },
          select: { id: true, key: true },
        });
        if (permissions.length !== permissionKeys.length) {
          const found = new Set(
            permissions.map((permission) => permission.key),
          );
          const unknown = permissionKeys.find((key) => !found.has(key));
          throw new BadRequestException(`Unknown permission: ${unknown}`);
        }

        const previousKeys = current.permissions
          .map(({ permission }) => permission.key)
          .sort();
        const nextKeys = [...permissionKeys].sort();
        const added = nextKeys.filter((key) => !previousKeys.includes(key));
        const removed = previousKeys.filter((key) => !nextKeys.includes(key));
        if (added.length === 0 && removed.length === 0) {
          const role = await this.getRoleWithClient(transaction, id);
          return {
            changed: false,
            role: this.toRoleResponse(role, 0),
            added,
            removed,
            affectedUsers: 0,
            activeSessionsBefore: 0,
            revokedSessions: 0,
            currentSessionRevoked: false,
            revokedUserIds: [] as string[],
          };
        }

        const versioned = await transaction.role.updateMany({
          where: { id, version: dto.expectedVersion },
          data: { version: { increment: 1 } },
        });
        if (versioned.count !== 1) {
          throw new ConflictException('Access profile version does not match');
        }

        await transaction.rolePermission.deleteMany({ where: { roleId: id } });
        await transaction.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });

        const affectedUsers = await transaction.user.findMany({
          where: { roleId: id },
          select: { id: true },
        });
        const affectedUserIds = affectedUsers.map((user) => user.id);
        const activeSessionCount = affectedUserIds.length
          ? await transaction.authSession.count({
              where: { userId: { in: affectedUserIds }, revokedAt: null },
            })
          : 0;
        await this.assertSecurityAdministratorsRemain(transaction);

        if (affectedUserIds.length > 0) {
          await transaction.user.updateMany({
            where: { id: { in: affectedUserIds } },
            data: { sessionVersion: { increment: 1 } },
          });
        }
        const revokedSessions = affectedUserIds.length
          ? await transaction.authSession.updateMany({
              where: { userId: { in: affectedUserIds }, revokedAt: null },
              data: { revokedAt: new Date() },
            })
          : { count: 0 };

        const role = await this.getRoleWithClient(transaction, id);
        await transaction.accessControlAuditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'ROLE_PERMISSIONS_UPDATED',
            targetType: 'ROLE',
            targetId: id,
            before: this.json({
              version: dto.expectedVersion,
              permissionKeys: previousKeys,
            }),
            after: this.json({
              version: role.version,
              permissionKeys: nextKeys,
            }),
            reason: dto.reason.trim(),
            affectedUserCount: affectedUserIds.length,
            revokedSessionCount: revokedSessions.count,
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          },
        });

        return {
          changed: true,
          role: this.toRoleResponse(role, 0),
          added,
          removed,
          affectedUsers: affectedUserIds.length,
          activeSessionsBefore: activeSessionCount,
          revokedSessions: revokedSessions.count,
          currentSessionRevoked: affectedUserIds.includes(actor.id),
          revokedUserIds: affectedUserIds,
        };
      },
      { isolationLevel: 'Serializable' },
    );
    if (transactionResult.changed) {
      this.sessionRevocationRegistry?.notify(transactionResult.revokedUserIds);
    }
    const { revokedUserIds, ...result } = transactionResult;
    void revokedUserIds;
    return result;
  }

  async getUserAccess(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userAccessInclude,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.loadUserAccess(this.prisma, user);
  }

  async updateUserAccessProfile(
    id: string,
    dto: UpdateUserAccessProfileDto,
    actor: AuthenticatedPrincipal,
    context: RequestContext = {},
  ) {
    const transactionResult = await this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.user.findUnique({
          where: { id },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
            operationalLocation: {
              select: { type: true, isActive: true },
            },
          },
        });
        if (!current) throw new NotFoundException('User not found');
        if (current.roleId !== dto.expectedRoleId) {
          throw new ConflictException('User access profile has changed');
        }

        const nextRole = await transaction.role.findUnique({
          where: { id: dto.roleId },
          include: { permissions: { include: { permission: true } } },
        });
        if (!nextRole) throw new NotFoundException('Access profile not found');
        this.assertCanonicalRole(nextRole.name);
        this.assertActorCanGrant(
          actor,
          nextRole.permissions.map(({ permission }) => permission.key),
        );

        if (current.roleId !== nextRole.id) {
          this.assertRoleLocationCompatibility(
            nextRole.name,
            current.operationalLocation,
          );
        }

        if (current.roleId === nextRole.id) {
          return {
            changed: false,
            access: await this.loadUserAccess(
              transaction,
              await transaction.user.findUniqueOrThrow({
                where: { id },
                include: userAccessInclude,
              }),
            ),
            revokedSessions: 0,
            currentSessionRevoked: false,
            revokedUserIds: [] as string[],
          };
        }

        await transaction.user.update({
          where: { id },
          data: { roleId: nextRole.id, sessionVersion: { increment: 1 } },
        });
        await this.assertSecurityAdministratorsRemain(transaction);
        const revokedSessions = await transaction.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const updatedUser = await transaction.user.findUniqueOrThrow({
          where: { id },
          include: userAccessInclude,
        });

        await transaction.accessControlAuditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'USER_ACCESS_PROFILE_UPDATED',
            targetType: 'USER',
            targetId: id,
            before: this.json({
              roleId: current.roleId,
              roleName: current.role.name,
            }),
            after: this.json({ roleId: nextRole.id, roleName: nextRole.name }),
            reason: dto.reason.trim(),
            affectedUserCount: 1,
            revokedSessionCount: revokedSessions.count,
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          },
        });

        return {
          changed: true,
          access: await this.loadUserAccess(transaction, updatedUser),
          revokedSessions: revokedSessions.count,
          currentSessionRevoked: actor.id === id,
          revokedUserIds: [id],
        };
      },
      { isolationLevel: 'Serializable' },
    );
    if (transactionResult.changed) {
      this.sessionRevocationRegistry?.notify(transactionResult.revokedUserIds);
    }
    const { revokedUserIds, ...result } = transactionResult;
    void revokedUserIds;
    return result;
  }

  async revokeUserSessions(
    id: string,
    dto: RevokeUserSessionsDto,
    actor: AuthenticatedPrincipal,
    context: RequestContext = {},
  ) {
    const transactionResult = await this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!user) throw new NotFoundException('User not found');

        await transaction.user.update({
          where: { id },
          data: { sessionVersion: { increment: 1 } },
        });
        const revokedSessions = await transaction.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await transaction.accessControlAuditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'USER_SESSIONS_REVOKED',
            targetType: 'USER',
            targetId: id,
            before: Prisma.JsonNull,
            after: this.json({ revoked: true }),
            reason: dto.reason.trim(),
            affectedUserCount: 1,
            revokedSessionCount: revokedSessions.count,
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          },
        });

        return {
          revokedSessions: revokedSessions.count,
          currentSessionRevoked: actor.id === id,
          revokedUserIds: [id],
        };
      },
      { isolationLevel: 'Serializable' },
    );
    this.sessionRevocationRegistry?.notify(transactionResult.revokedUserIds);
    const { revokedUserIds, ...result } = transactionResult;
    void revokedUserIds;
    return result;
  }

  async listAuditLogs(query: ListAccessAuditLogsDto) {
    const where: Prisma.AccessControlAuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.accessControlAuditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.accessControlAuditLog.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  private async getRoleWithClient(client: AccessClient, id: string) {
    const role = await client.role.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!role) throw new NotFoundException('Access profile not found');
    return role;
  }

  private async loadUserAccess(client: AccessClient, user: UserWithAccess) {
    const sessions = await client.authSession.findMany({
      where: { userId: user.id, revokedAt: null },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        absoluteExpiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        controlNumber: user.controlNumber,
        isActive: user.isActive,
        roleId: user.roleId,
        role: {
          id: user.role.id,
          name: user.role.name,
          description: user.role.description,
          version: user.role.version,
        },
        operationalLocation: user.operationalLocation,
      },
      permissions: user.role.permissions.map(
        ({ permission }) => permission.key,
      ),
      activeSessionCount: sessions.length,
      sessions,
    };
  }

  private toRoleResponse(role: RoleWithAccess, activeSessionCount = 0) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      version: role.version,
      userCount: role._count.users,
      activeSessionCount,
      permissions: role.permissions.map(({ permission }) => ({
        key: permission.key,
        description: permission.description,
        ...PERMISSION_METADATA[permission.key as Permission],
      })),
    };
  }

  private assertCanonicalRole(name: string) {
    if (!(CANONICAL_ROLE_NAMES as readonly string[]).includes(name)) {
      throw new ForbiddenException(
        'Only canonical access profiles can be managed',
      );
    }
  }

  private assertRoleLocationCompatibility(
    roleName: string,
    location: { type: string; isActive: boolean } | null,
  ): void {
    const allowedTypes =
      roleName === 'ADMIN'
        ? EMPLOYEE_LOCATION_TYPES
        : roleName === 'WAREHOUSE'
          ? WAREHOUSE_LOCATION_TYPES
          : SELLER_LOCATION_TYPES;

    if (!location?.isActive || !allowedTypes.includes(location.type)) {
      throw new BadRequestException(
        'Operational location is not available for the selected access profile',
      );
    }
  }

  private assertActorCanGrant(
    actor: AuthenticatedPrincipal,
    permissionKeys: readonly string[],
  ) {
    const actorPermissions = new Set(actor.permissions ?? []);
    const unauthorized = permissionKeys.find(
      (key) => !actorPermissions.has(key),
    );
    if (unauthorized) {
      throw new ForbiddenException(`Cannot grant permission: ${unauthorized}`);
    }
  }

  private async assertSecurityAdministratorsRemain(
    client: Prisma.TransactionClient,
  ) {
    const [profileManagers, userManagers] = await Promise.all([
      client.user.count({
        where: {
          isActive: true,
          role: {
            permissions: {
              some: { permission: { key: PERMISSIONS.ACCESS_PROFILES_MANAGE } },
            },
          },
        },
      }),
      client.user.count({
        where: {
          isActive: true,
          role: {
            permissions: {
              some: { permission: { key: PERMISSIONS.USERS_MANAGE } },
            },
          },
        },
      }),
    ]);
    if (profileManagers < 1) {
      throw new ForbiddenException(
        'At least one active access profile manager is required',
      );
    }
    if (userManagers < 1) {
      throw new ForbiddenException(
        'At least one active user manager is required',
      );
    }
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
