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
            items: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                isActive: boolean;
                email: string;
                controlNumber: string;
                phone: string;
                roleId: string;
                operationalLocationId: string;
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
                operationalLocation: {
                    id: string;
                    name: string;
                    type: string;
                };
            }[];
            total: number;
            page: number;
            limit: number;
        };
    }>;
    findOne(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            isActive: boolean;
            email: string;
            controlNumber: string;
            phone: string;
            roleId: string;
            operationalLocationId: string;
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
            operationalLocation: {
                id: string;
                name: string;
                type: string;
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
            isActive: boolean;
            email: string;
            controlNumber: string;
            phone: string;
            roleId: string;
            operationalLocationId: string;
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
            operationalLocation: {
                id: string;
                name: string;
                type: string;
            };
        } & {
            temporaryPassword: string;
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
            isActive: boolean;
            email: string;
            controlNumber: string;
            phone: string;
            roleId: string;
            operationalLocationId: string;
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
            operationalLocation: {
                id: string;
                name: string;
                type: string;
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
            isActive: boolean;
            email: string;
            controlNumber: string;
            phone: string;
            roleId: string;
            operationalLocationId: string;
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
            operationalLocation: {
                id: string;
                name: string;
                type: string;
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
            isActive: boolean;
            email: string;
            controlNumber: string;
            phone: string;
            roleId: string;
            operationalLocationId: string;
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
            operationalLocation: {
                id: string;
                name: string;
                type: string;
            };
        };
    }>;
}
