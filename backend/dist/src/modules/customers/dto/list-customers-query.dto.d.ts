import { AgingStatus, CreditStatus, CustomerType } from '@prisma/client';
export type CustomerAgingFilter = AgingStatus | 'LATE';
export declare class ListCustomersQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    customerType?: CustomerType;
    creditStatus?: CreditStatus;
    commercialPolicyId?: string;
    assignedRouteId?: string;
    agingStatus?: CustomerAgingFilter;
    cartera?: CustomerAgingFilter;
    isActive?: boolean;
}
