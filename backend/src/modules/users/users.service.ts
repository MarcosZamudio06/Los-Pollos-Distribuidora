import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  ACCESS_TRANSACTION_OPTIONS,
  lockAccessAuthority,
  loadAccessActor,
  assertRoleAuthority,
  assertSecurityAdministratorsRemain,
} from '../../common/authorization/access-authority';
import { PERMISSIONS } from '../../common/authorization/permissions';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';
import { isEmployeeLocationAllowed } from '../../common/authorization/employee-location-policy';
import {
  CreateUserDto,
  DeactivateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UpdateUserPasswordDto,
} from './dto';

const ADMIN_ROLE_NAME = 'ADMIN';
const PASSWORD_HASH_ROUNDS = 12;
const MIN_TEMPORARY_PASSWORD_LENGTH = 10;

type RoleRecord = {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  controlNumber: string;
  phone: string;
  passwordHash: string;
  roleId: string;
  operationalLocationId: string;
  cedisLocationId: string | null;
  operationalLocation: { id: string; name: string; type: string };
  cedisLocation: { id: string; name: string; type: string } | null;
  role: RoleRecord;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  deactivatedByUserId: string | null;
  deactivationReason: string | null;
};

type UserResponse = Omit<UserRecord, 'passwordHash'>;
type CreatedUserResponse = UserResponse & { temporaryPassword: string };

type UsersTransactionClient = Pick<
  PrismaService,
  'user' | 'role' | 'operationalLocation' | 'authSession'
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly sessionRevocationRegistry?: SessionRevocationRegistry,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<{
    items: UserResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where = this.buildListWhere(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          role: true,
          operationalLocation: true,
          cedisLocation: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => this.toUserResponse(user)),
      total,
      page,
      limit,
    };
  }

  async findRoles(): Promise<RoleRecord[]> {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        operationalLocation: true,
        cedisLocation: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserResponse(user);
  }

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedPrincipal,
  ): Promise<CreatedUserResponse> {
    return this.prisma
      .$transaction(async (tx) => {
        await lockAccessAuthority(tx);
        const authority = await loadAccessActor(
          tx,
          actor,
          PERMISSIONS.USERS_MANAGE,
        );
        const role = await tx.role.findUnique({
          where: { id: dto.roleId },
          include: { permissions: { include: { permission: true } } },
        });
        if (!role) throw new BadRequestException('Role does not exist');
        assertRoleAuthority(authority, role);
        const email = this.normalizeEmail(dto.email);
        const phone = this.normalizePhone(dto.phone);
        const cedisLocationId = this.normalizeOptionalLocationId(
          dto.cedisLocationId,
        );
        await this.assertEmailAvailable(email, undefined, tx);
        await this.assertPhoneAvailable(phone, tx);
        await this.assertEmployeeLocation(
          dto.operationalLocationId,
          role.name,
          tx,
        );
        await this.assertCedisLocation(cedisLocationId, tx);
        // Generate credentials only after authoritative denial checks complete.
        const temporaryPassword = this.generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(
          temporaryPassword,
          PASSWORD_HASH_ROUNDS,
        );
        const user = await tx.user.create({
          data: {
            name: dto.name,
            email,
            phone,
            controlNumber: await this.nextControlNumber(tx),
            roleId: role.id,
            operationalLocationId: dto.operationalLocationId,
            ...(cedisLocationId ? { cedisLocationId } : {}),
            passwordHash,
            isActive: true,
            mustChangePassword: true,
          },
          include: {
            role: true,
            operationalLocation: true,
            cedisLocation: true,
          },
        });
        await tx.accessControlAuditLog.create({
          data: {
            actorUserId: authority.id,
            action: 'USER_CREATED',
            targetType: 'USER',
            targetId: user.id,
            after: { roleId: role.id, roleName: role.name },
            reason: 'Employee account creation',
            affectedUserCount: 1,
          },
        });
        return { ...this.toUserResponse(user), temporaryPassword };
      }, ACCESS_TRANSACTION_OPTIONS)
      .catch((error: unknown) => {
        this.throwUniqueConstraintConflict(error);
        throw error;
      });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedPrincipal,
  ): Promise<UserResponse> {
    if (dto.roleId !== undefined) {
      throw new BadRequestException(
        'Use the access-profile endpoint to change a user profile',
      );
    }

    return this.prisma
      .$transaction(async (tx) => {
        await lockAccessAuthority(tx);
        const authority = await loadAccessActor(
          tx,
          actor,
          PERMISSIONS.USERS_MANAGE,
        );
        const target = await tx.user.findUnique({
          where: { id },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        });
        if (!target) throw new NotFoundException('User not found');
        assertRoleAuthority(authority, target.role);
        const client = tx as UsersTransactionClient;
        const email = dto.email ? this.normalizeEmail(dto.email) : undefined;
        if (email) {
          await this.assertEmailAvailable(email, id, client);
        }

        await this.findActiveUserForMutation(id, client);

        const user = await client.user.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(email !== undefined ? { email } : {}),
          },
          include: {
            role: true,
            operationalLocation: true,
            cedisLocation: true,
          },
        });

        await tx.accessControlAuditLog.create({
          data: {
            actorUserId: authority.id,
            action: 'USER_UPDATED',
            targetType: 'USER',
            targetId: id,
            before: { name: target.name, email: target.email },
            after: { name: user.name, email: user.email },
            reason: 'Employee account update',
            affectedUserCount: 1,
          },
        });
        return this.toUserResponse(user);
      }, ACCESS_TRANSACTION_OPTIONS)
      .catch((error: unknown) => {
        this.throwUniqueConstraintConflict(error);
        throw error;
      });
  }

  async updatePassword(
    id: string,
    dto: UpdateUserPasswordDto,
    actor: AuthenticatedPrincipal,
  ): Promise<UserResponse> {
    this.assertTemporaryPassword(dto.temporaryPassword);
    const user = await this.prisma.$transaction(async (tx) => {
      await lockAccessAuthority(tx);
      const authority = await loadAccessActor(
        tx,
        actor,
        PERMISSIONS.USERS_MANAGE,
      );
      const target = await tx.user.findUnique({
        where: { id },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      });
      if (!target) throw new NotFoundException('User not found');
      assertRoleAuthority(authority, target.role);
      const passwordHash = await bcrypt.hash(
        dto.temporaryPassword,
        PASSWORD_HASH_ROUNDS,
      );
      const updated = await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          sessionVersion: { increment: 1 },
        },
        include: { role: true, operationalLocation: true, cedisLocation: true },
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.accessControlAuditLog.create({
        data: {
          actorUserId: authority.id,
          action: 'USER_PASSWORD_RESET',
          targetType: 'USER',
          targetId: id,
          before: { sessionVersion: target.sessionVersion },
          after: {
            sessionVersion: updated.sessionVersion,
            mustChangePassword: true,
          },
          reason: 'Administrative credential reset',
          affectedUserCount: 1,
          revokedSessionCount: revoked.count,
        },
      });
      return updated;
    }, ACCESS_TRANSACTION_OPTIONS);
    this.sessionRevocationRegistry?.notify([id]);
    return this.toUserResponse(user);
  }

  async deactivate(
    id: string,
    actor: AuthenticatedPrincipal,
    dto: DeactivateUserDto,
  ): Promise<UserResponse> {
    const user = await this.prisma.$transaction(async (tx) => {
      await lockAccessAuthority(tx);
      const authority = await loadAccessActor(
        tx,
        actor,
        PERMISSIONS.USERS_MANAGE,
      );
      const target = await tx.user.findUnique({
        where: { id },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      });
      if (!target) throw new NotFoundException('User not found');
      assertRoleAuthority(authority, target.role);
      const client = tx as UsersTransactionClient;
      const currentUser = await this.findActiveUserForMutation(id, client);
      await this.assertNotLastActiveAdmin(currentUser, client);

      const user = await client.user.update({
        where: { id },
        data: {
          isActive: false,
          sessionVersion: { increment: 1 },
          deactivatedAt: new Date(),
          deactivatedByUserId: authority.id,
          deactivationReason: dto.reason ?? null,
        },
        include: {
          role: true,
          operationalLocation: true,
          cedisLocation: true,
        },
      });
      await client.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await assertSecurityAdministratorsRemain(tx);
      await tx.accessControlAuditLog.create({
        data: {
          actorUserId: authority.id,
          action: 'USER_DEACTIVATED',
          targetType: 'USER',
          targetId: id,
          before: { isActive: true },
          after: { isActive: false },
          reason: dto.reason ?? 'Employee deactivation',
          affectedUserCount: 1,
        },
      });
      return this.toUserResponse(user);
    }, ACCESS_TRANSACTION_OPTIONS);
    this.sessionRevocationRegistry?.notify([id]);
    return user;
  }

  private toUserResponse(user: UserRecord): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      controlNumber: user.controlNumber,
      phone: user.phone,
      roleId: user.roleId,
      operationalLocationId: user.operationalLocationId,
      cedisLocationId: user.cedisLocationId,
      operationalLocation: user.operationalLocation,
      cedisLocation: user.cedisLocation,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deactivatedAt: user.deactivatedAt,
      deactivatedByUserId: user.deactivatedByUserId,
      deactivationReason: user.deactivationReason,
    };
  }

  private buildListWhere(query: ListUsersQueryDto): Prisma.UserWhereInput {
    const status =
      query.status === 'all' || query.includeInactive === true
        ? undefined
        : query.status === 'inactive'
          ? false
          : true;
    const search = query.search?.trim();
    return {
      ...(status === undefined ? {} : { isActive: status }),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.operationalLocationId
        ? { operationalLocationId: query.operationalLocationId }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { controlNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s-]/g, '').trim();
  }

  private normalizeOptionalLocationId(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private generateTemporaryPassword(): string {
    return randomBytes(12).toString('base64url');
  }

  private async nextControlNumber(
    client: Prisma.TransactionClient,
  ): Promise<string> {
    const rows = await client.$queryRawUnsafe<
      Array<{ value: bigint | number }>
    >('SELECT nextval(\'"User_controlNumber_seq"\') AS value');
    return `EPDP-${String(rows[0].value).padStart(6, '0')}`;
  }

  private async assertPhoneAvailable(
    phone: string,
    client: UsersTransactionClient,
  ): Promise<void> {
    const existing = await client.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('Phone is already registered');
  }

  private async assertEmployeeLocation(
    locationId: string,
    roleName: string,
    client: UsersTransactionClient,
  ): Promise<void> {
    const location = await client.operationalLocation.findUnique({
      where: { id: locationId },
    });
    if (
      !location ||
      !location.isActive ||
      !isEmployeeLocationAllowed(roleName, location.type)
    ) {
      throw new BadRequestException(
        'Operational location is not available for employees',
      );
    }
  }

  private async assertCedisLocation(
    locationId: string | undefined,
    client: UsersTransactionClient,
  ): Promise<void> {
    if (!locationId) return;

    const location = await client.operationalLocation.findUnique({
      where: { id: locationId },
    });

    if (
      !location ||
      !location.isActive ||
      location.type !== 'DISTRIBUTION_CENTER'
    ) {
      throw new BadRequestException(
        'CEDIS location is not available for employees',
      );
    }
  }

  private assertTemporaryPassword(temporaryPassword: string): void {
    if (temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
      throw new BadRequestException(
        'Temporary password must be at least 10 characters long',
      );
    }
  }

  private async assertEmailAvailable(
    email: string,
    currentUserId?: string,
    client: UsersTransactionClient = this.prisma,
  ): Promise<void> {
    const existingUser = await client.user.findUnique({ where: { email } });

    if (existingUser && existingUser.id !== currentUserId) {
      throw new ConflictException('Email is already registered');
    }
  }

  private async findActiveUserForMutation(
    id: string,
    client: UsersTransactionClient,
  ): Promise<UserRecord> {
    const user = await client.user.findFirst({
      where: { id, isActive: true },
      include: {
        role: true,
        operationalLocation: true,
        cedisLocation: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async assertNotLastActiveAdmin(
    user: UserRecord,
    client: UsersTransactionClient,
  ): Promise<void> {
    if (user.role.name !== ADMIN_ROLE_NAME || !user.isActive) {
      return;
    }

    const activeAdminCount = await client.user.count({
      where: {
        isActive: true,
        role: { name: ADMIN_ROLE_NAME },
      },
    });

    if (activeAdminCount <= 1) {
      throw new ForbiddenException('Cannot modify the last active ADMIN');
    }
  }

  private throwUniqueConstraintConflict(error: unknown): void {
    if (this.isUniqueConstraintError(error)) {
      const target = this.getUniqueConstraintTarget(error);
      if (target.includes('phone')) {
        throw new ConflictException('Phone is already registered');
      }
      if (target.includes('controlNumber')) {
        throw new ConflictException('Control number is already registered');
      }
      throw new ConflictException('Email is already registered');
    }
  }

  private getUniqueConstraintTarget(error: unknown): string[] {
    if (typeof error !== 'object' || error === null || !('meta' in error))
      return [];
    const meta = error.meta;
    if (typeof meta !== 'object' || meta === null || !('target' in meta))
      return [];
    const target = meta.target;
    return Array.isArray(target)
      ? target.filter((value): value is string => typeof value === 'string')
      : typeof target === 'string'
        ? [target]
        : [];
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
