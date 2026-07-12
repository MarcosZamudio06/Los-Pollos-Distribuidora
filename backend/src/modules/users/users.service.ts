import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
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
const EMPLOYEE_LOCATION_TYPES = ['BRANCH', 'MIXED', 'EXTERNAL_POINT_OF_SALE'];
const LAST_ADMIN_TRANSACTION_OPTIONS = {
  isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel,
} as const;

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
  operationalLocation: { id: string; name: string; type: string };
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

type UsersTransactionClient = Pick<PrismaService, 'user' | 'role' | 'operationalLocation'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListUsersQueryDto): Promise<{ items: UserResponse[]; total: number; page: number; limit: number }> {
    const where = this.buildListWhere(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [users, total] = await Promise.all([this.prisma.user.findMany({
      where,
      include: { role: true, operationalLocation: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }), this.prisma.user.count({ where })]);

    return { items: users.map((user) => this.toUserResponse(user)), total, page, limit };
  }

  async findRoles(): Promise<RoleRecord[]> {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true, operationalLocation: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserResponse(user);
  }

  async create(dto: CreateUserDto): Promise<CreatedUserResponse> {
    const email = this.normalizeEmail(dto.email);
    const phone = this.normalizePhone(dto.phone);
    await this.assertEmailAvailable(email);
    await this.assertPhoneAvailable(phone);
    await this.assertRoleExists(dto.roleId);
    await this.assertEmployeeLocation(dto.operationalLocationId);
    const temporaryPassword = this.generateTemporaryPassword();

    const passwordHash = await bcrypt.hash(
      temporaryPassword,
      PASSWORD_HASH_ROUNDS,
    );

    const user = await this.prisma.user
      .create({
        data: {
          name: dto.name,
          email,
          phone,
          controlNumber: await this.nextControlNumber(),
          roleId: dto.roleId,
          operationalLocationId: dto.operationalLocationId,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
        },
        include: { role: true, operationalLocation: true },
      })
      .catch((error: unknown) => {
        this.throwUniqueConstraintConflict(error);
        throw error;
      });

    return { ...this.toUserResponse(user), temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponse> {
    return this.prisma
      .$transaction(async (tx) => {
        const client = tx as UsersTransactionClient;
        const email = dto.email ? this.normalizeEmail(dto.email) : undefined;
        if (email) {
          await this.assertEmailAvailable(email, id, client);
        }

        const nextRole = dto.roleId
          ? await this.assertRoleExists(dto.roleId, client)
          : undefined;
        const currentUser = await this.findActiveUserForMutation(id, client);

        if (nextRole && nextRole.name !== ADMIN_ROLE_NAME) {
          await this.assertNotLastActiveAdmin(currentUser, client);
        }

        const user = await client.user.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(email !== undefined ? { email } : {}),
            ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
          },
          include: { role: true, operationalLocation: true },
        });

        return this.toUserResponse(user);
      }, LAST_ADMIN_TRANSACTION_OPTIONS)
      .catch((error: unknown) => {
        this.throwUniqueConstraintConflict(error);
        throw error;
      });
  }

  async updatePassword(
    id: string,
    dto: UpdateUserPasswordDto,
  ): Promise<UserResponse> {
    this.assertTemporaryPassword(dto.temporaryPassword);
    await this.ensureUserExists(id);

    const passwordHash = await bcrypt.hash(
      dto.temporaryPassword,
      PASSWORD_HASH_ROUNDS,
    );

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
      include: { role: true, operationalLocation: true },
    });

    return this.toUserResponse(user);
  }

  async deactivate(
    id: string,
    actorUserId: string,
    dto: DeactivateUserDto,
  ): Promise<UserResponse> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as UsersTransactionClient;
      const currentUser = await this.findActiveUserForMutation(id, client);
      await this.assertNotLastActiveAdmin(currentUser, client);

      const user = await client.user.update({
        where: { id },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedByUserId: actorUserId,
          deactivationReason: dto.reason ?? null,
        },
        include: { role: true, operationalLocation: true },
      });

      return this.toUserResponse(user);
    }, LAST_ADMIN_TRANSACTION_OPTIONS);
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
      operationalLocation: user.operationalLocation,
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
    const status = query.status === 'all' || query.includeInactive === true
      ? undefined : query.status === 'inactive' ? false : true;
    const search = query.search?.trim();
    return {
      ...(status === undefined ? {} : { isActive: status }),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.operationalLocationId ? { operationalLocationId: query.operationalLocationId } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { controlNumber: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s-]/g, '').trim();
  }

  private generateTemporaryPassword(): string {
    return randomBytes(12).toString('base64url');
  }

  private async nextControlNumber(): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ value: bigint | number }>>(
      'SELECT nextval(\'"User_controlNumber_seq"\') AS value',
    );
    return `EPDP-${String(rows[0].value).padStart(6, '0')}`;
  }

  private async assertPhoneAvailable(phone: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('Phone is already registered');
  }

  private async assertEmployeeLocation(locationId: string): Promise<void> {
    const location = await this.prisma.operationalLocation.findUnique({ where: { id: locationId } });
    if (!location || !location.isActive || !EMPLOYEE_LOCATION_TYPES.includes(location.type)) {
      throw new BadRequestException('Operational location is not available for employees');
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

  private async assertRoleExists(
    roleId: string,
    client: UsersTransactionClient = this.prisma,
  ): Promise<RoleRecord> {
    const role = await client.role.findUnique({ where: { id: roleId } });

    if (!role) {
      throw new BadRequestException('Role does not exist');
    }

    return role;
  }

  private async ensureUserExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async findActiveUserForMutation(
    id: string,
    client: UsersTransactionClient,
  ): Promise<UserRecord> {
    const user = await client.user.findFirst({
      where: { id, isActive: true },
      include: { role: true, operationalLocation: true },
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
    if (typeof error !== 'object' || error === null || !('meta' in error)) return [];
    const meta = error.meta;
    if (typeof meta !== 'object' || meta === null || !('target' in meta)) return [];
    const target = meta.target;
    return Array.isArray(target) ? target.filter((value): value is string => typeof value === 'string') : typeof target === 'string' ? [target] : [];
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
