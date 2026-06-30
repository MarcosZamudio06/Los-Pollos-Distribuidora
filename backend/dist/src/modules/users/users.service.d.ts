import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto, DeactivateUserDto, ListUsersQueryDto, UpdateUserDto, UpdateUserPasswordDto } from './dto';
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
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(query: ListUsersQueryDto): Promise<UserResponse[]>;
    findOne(id: string): Promise<UserResponse>;
    create(dto: CreateUserDto): Promise<UserResponse>;
    update(id: string, dto: UpdateUserDto): Promise<UserResponse>;
    updatePassword(id: string, dto: UpdateUserPasswordDto): Promise<UserResponse>;
    deactivate(id: string, actorUserId: string, dto: DeactivateUserDto): Promise<UserResponse>;
    private toUserResponse;
    private buildListWhere;
    private normalizeEmail;
    private assertTemporaryPassword;
    private assertEmailAvailable;
    private assertRoleExists;
    private ensureUserExists;
    private findActiveUserForMutation;
    private assertNotLastActiveAdmin;
    private throwDuplicateEmailConflict;
    private isUniqueConstraintError;
}
export {};
