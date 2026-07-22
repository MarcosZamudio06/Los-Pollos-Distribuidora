import type { AuthenticatedUser } from '../auth/auth.types';
import { CommercialPoliciesService } from './commercial-policies.service';
import { CreateCommercialPolicyDto, CreateDiscountAuthorizationDto, ListCommercialPoliciesQueryDto, UpdateCommercialPolicyDto } from './dto';
export declare class CommercialPoliciesController {
    private readonly service;
    constructor(service: CommercialPoliciesService);
    findAll(query: ListCommercialPoliciesQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: {
                id: string;
                name: string;
                description: string | null;
                customerType: import("@prisma/client").$Enums.CustomerType | null;
                priceListId: string | null;
                defaultCreditLimit: string | null;
                defaultCreditDays: number | null;
                overdueBlockingMode: import("@prisma/client").$Enums.OverdueBlockingMode | null;
                creditLimitBlockingMode: string | null;
                allowAdministrativeOverride: boolean;
                maximumDiscountPercentage: string;
                isActive: boolean;
                effectiveFrom: Date | null;
                effectiveTo: Date | null;
                createdByUserId: string;
                updatedByUserId: string;
                createdAt: Date;
                updatedAt: Date;
            }[];
        };
    }>;
    create(body: CreateCommercialPolicyDto, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            description: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType | null;
            priceListId: string | null;
            defaultCreditLimit: string | null;
            defaultCreditDays: number | null;
            overdueBlockingMode: import("@prisma/client").$Enums.OverdueBlockingMode | null;
            creditLimitBlockingMode: string | null;
            allowAdministrativeOverride: boolean;
            maximumDiscountPercentage: string;
            isActive: boolean;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            createdByUserId: string;
            updatedByUserId: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    authorizeDiscount(policyId: string, body: CreateDiscountAuthorizationDto, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            createdAt: Date;
            commercialPolicyId: string;
            reason: string;
            evidence: string;
            authorizedForUserId: string | null;
            maximumPercentage: import("@prisma/client/runtime/library").Decimal;
            authorizedByUserId: string;
            expiresAt: Date | null;
            usedAt: Date | null;
        };
    }>;
    update(id: string, body: UpdateCommercialPolicyDto, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            description: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType | null;
            priceListId: string | null;
            defaultCreditLimit: string | null;
            defaultCreditDays: number | null;
            overdueBlockingMode: import("@prisma/client").$Enums.OverdueBlockingMode | null;
            creditLimitBlockingMode: string | null;
            allowAdministrativeOverride: boolean;
            maximumDiscountPercentage: string;
            isActive: boolean;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            createdByUserId: string;
            updatedByUserId: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    deactivate(id: string, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            description: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType | null;
            priceListId: string | null;
            defaultCreditLimit: string | null;
            defaultCreditDays: number | null;
            overdueBlockingMode: import("@prisma/client").$Enums.OverdueBlockingMode | null;
            creditLimitBlockingMode: string | null;
            allowAdministrativeOverride: boolean;
            maximumDiscountPercentage: string;
            isActive: boolean;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            createdByUserId: string;
            updatedByUserId: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
}
