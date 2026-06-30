import { CreditStatus, CustomerType } from '@prisma/client';
export declare class ListCustomersQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    customerType?: CustomerType;
    creditStatus?: CreditStatus;
    commercialPolicyId?: string;
    assignedRouteId?: string;
    isActive?: boolean;
}
