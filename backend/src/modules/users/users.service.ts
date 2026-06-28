import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
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
  passwordHash: string;
  roleId: string;
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

type UsersTransactionClient = Pick<PrismaService, 'user' | 'role'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListUsersQueryDto): Promise<UserResponse[]> {
    const users = await this.prisma.user.findMany({
      where: this.buildListWhere(query),
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => this.toUserResponse(user));
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserResponse(user);
  }

  async create(dto: CreateUserDto): Promise<UserResponse> {
    this.assertTemporaryPassword(dto.temporaryPassword);
    const email = this.normalizeEmail(dto.email);
    await this.assertEmailAvailable(email);
    await this.assertRoleExists(dto.roleId);

    const passwordHash = await bcrypt.hash(
      dto.temporaryPassword,
      PASSWORD_HASH_ROUNDS,
    );

    const user = await this.prisma.user
      .create({
        data: {
          name: dto.name,
          email,
          roleId: dto.roleId,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
        },
        include: { role: true },
      })
      .catch((error: unknown) => {
        this.throwDuplicateEmailConflict(error);
        throw error;
      });

    return this.toUserResponse(user);
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
          include: { role: true },
        });

        return this.toUserResponse(user);
      }, LAST_ADMIN_TRANSACTION_OPTIONS)
      .catch((error: unknown) => {
        this.throwDuplicateEmailConflict(error);
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
      include: { role: true },
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
        include: { role: true },
      });

      return this.toUserResponse(user);
    }, LAST_ADMIN_TRANSACTION_OPTIONS);
  }

  private toUserResponse(user: UserRecord): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
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

  private buildListWhere(
    query: ListUsersQueryDto,
  ): { isActive: boolean } | undefined {
    if (query.status === 'all' || query.includeInactive === true) {
      return undefined;
    }

    if (query.status === 'inactive') {
      return { isActive: false };
    }

    return { isActive: true };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
      include: { role: true },
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

  private throwDuplicateEmailConflict(error: unknown): void {
    if (this.isUniqueConstraintError(error)) {
      throw new ConflictException('Email is already registered');
    }
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
