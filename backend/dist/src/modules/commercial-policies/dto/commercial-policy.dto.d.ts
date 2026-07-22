import { CustomerType, OverdueBlockingMode } from '@prisma/client';
export { OverdueBlockingMode } from '@prisma/client';
export declare class ListCommercialPoliciesQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    customerType?: CustomerType;
    isActive?: boolean;
}
export declare class CreateCommercialPolicyDto {
    name?: string;
    description?: string;
    customerType?: CustomerType;
    priceListId?: string;
    defaultCreditLimit?: number;
    defaultCreditDays?: number;
    overdueBlockingMode?: OverdueBlockingMode;
    creditLimitBlockingMode?: string;
    allowAdministrativeOverride?: boolean;
    maximumDiscountPercentage?: number;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    isActive?: boolean;
}
export declare class UpdateCommercialPolicyDto extends CreateCommercialPolicyDto {
}
export declare class CreateDiscountAuthorizationDto {
    authorizedForUserId?: string;
    maximumPercentage: number;
    reason: string;
    evidence: string;
    expiresAt?: string;
}
