export type UserStatusFilter = 'active' | 'inactive' | 'all';
export declare class ListUsersQueryDto {
    status?: UserStatusFilter;
    includeInactive?: boolean;
    search?: string;
    roleId?: string;
    operationalLocationId?: string;
    page?: number;
    limit?: number;
}
