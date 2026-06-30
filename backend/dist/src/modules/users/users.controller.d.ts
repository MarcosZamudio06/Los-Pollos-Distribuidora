import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateUserDto, DeactivateUserDto, ListUsersQueryDto, UpdateUserDto, UpdateUserPasswordDto } from './dto';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    findAll(query: ListUsersQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            roleId: string;
            isActive: boolean;
            mustChangePassword: boolean;
            deactivatedAt: Date | null;
            deactivatedByUserId: string | null;
            deactivationReason: string | null;
            role: {
                id: string;
                name: string;
                description?: string | null;
                createdAt?: Date;
                updatedAt?: Date;
            };
        }[];
    }>;
    findOne(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            roleId: string;
            isActive: boolean;
            mustChangePassword: boolean;
            deactivatedAt: Date | null;
            deactivatedByUserId: string | null;
            deactivationReason: string | null;
            role: {
                id: string;
                name: string;
                description?: string | null;
                createdAt?: Date;
                updatedAt?: Date;
            };
        };
    }>;
    create(body: CreateUserDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            roleId: string;
            isActive: boolean;
            mustChangePassword: boolean;
            deactivatedAt: Date | null;
            deactivatedByUserId: string | null;
            deactivationReason: string | null;
            role: {
                id: string;
                name: string;
                description?: string | null;
                createdAt?: Date;
                updatedAt?: Date;
            };
        };
    }>;
    update(id: string, body: UpdateUserDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            roleId: string;
            isActive: boolean;
            mustChangePassword: boolean;
            deactivatedAt: Date | null;
            deactivatedByUserId: string | null;
            deactivationReason: string | null;
            role: {
                id: string;
                name: string;
                description?: string | null;
                createdAt?: Date;
                updatedAt?: Date;
            };
        };
    }>;
    updatePassword(id: string, body: UpdateUserPasswordDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            roleId: string;
            isActive: boolean;
            mustChangePassword: boolean;
            deactivatedAt: Date | null;
            deactivatedByUserId: string | null;
            deactivationReason: string | null;
            role: {
                id: string;
                name: string;
                description?: string | null;
                createdAt?: Date;
                updatedAt?: Date;
            };
        };
    }>;
    deactivate(id: string, currentUser: AuthenticatedUser, body: DeactivateUserDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            roleId: string;
            isActive: boolean;
            mustChangePassword: boolean;
            deactivatedAt: Date | null;
            deactivatedByUserId: string | null;
            deactivationReason: string | null;
            role: {
                id: string;
                name: string;
                description?: string | null;
                createdAt?: Date;
                updatedAt?: Date;
            };
        };
    }>;
}
