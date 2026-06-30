import { CreditStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto';
type CustomerListRecord = Prisma.CustomerGetPayload<Record<string, never>>;
type CustomerResponse = Omit<CustomerListRecord, 'creditLimit'> & {
    creditLimit: string | number | null;
    isBlockedForCredit: boolean;
    commercialPolicy?: unknown;
    creditSummary?: {
        globalBalance: string;
        outstandingAmount: string;
        overdueAmount: string;
        availableCredit: string | null;
        creditLimit: string | null;
        creditDays: number | null;
        daysOverdue: number;
        lastPaymentDate: Date | null;
        creditStatus: CreditStatus;
        isBlockedForCredit: boolean;
    };
    billingSummary?: {
        billedAmount: string;
        paidAmount: string;
        finalBalance: string;
        openAdministrativeOrders: number;
    };
};
type CustomerListResponse = {
    items: CustomerResponse[];
};
export declare class CustomersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(query?: ListCustomersQueryDto): Promise<CustomerListResponse>;
    findOne(id: string): Promise<CustomerResponse>;
    create(dto: CreateCustomerDto, currentUser?: AuthenticatedUser): Promise<CustomerResponse>;
    update(id: string, dto: UpdateCustomerDto, currentUser?: AuthenticatedUser): Promise<CustomerResponse>;
    deactivate(id: string): Promise<CustomerResponse>;
    private buildListWhere;
    private buildPagination;
    private findActiveCustomerForMutation;
    private assertPhoneAvailable;
    private assertCanMutateCommercialTerms;
    private hasRestrictedCommercialTerms;
    private assertCoherentCreditTerms;
    private assertCoherentCreditTermsForUpdate;
    private hasCreditTermMutation;
    private normalizeMutationData;
    private normalizeOptionalText;
    private toCustomerResponse;
    private isCustomerDetailRecord;
    private buildCreditSummary;
    private buildBillingSummary;
    private throwUniqueConflict;
    private isUniqueConstraintError;
}
export {};
