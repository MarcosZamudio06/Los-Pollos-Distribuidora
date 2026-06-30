export type UserStatusFilter = 'active' | 'inactive' | 'all';
export declare class ListUsersQueryDto {
    status?: UserStatusFilter;
    includeInactive?: boolean;
}
