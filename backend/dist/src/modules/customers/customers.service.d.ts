import { CreditStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateCustomerDto, ListCustomerPaymentsQueryDto, ListCustomerSalesQueryDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto';
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
    getCreditSummary(id: string): Promise<{
        customerId: string;
        creditStatus: import("@prisma/client").$Enums.CreditStatus;
        creditLimit: string | null;
        creditDays: number | null;
        paymentTermsDays: number | null;
        agingStatus: import("@prisma/client").$Enums.AgingStatus;
        collectionStatus: import("@prisma/client").$Enums.CollectionStatus;
        globalBalance: string;
        outstandingAmount: string;
        overdueAmount: string;
        availableCredit: string | null;
        hasOverdueBalance: boolean;
        isBlocked: boolean;
        isBlockedForCredit: boolean;
        blockingReason: string | null;
        daysOverdue: number;
        lastPaymentDate: Date | null;
        commercialPolicyId: string | null;
        commercialPolicyApplied: string | null;
        billingSummary: {
            billedAmount: string;
            paidAmount: string;
            finalBalance: string;
            openAdministrativeOrders: number;
        } | undefined;
        billedAmount: string | undefined;
        paidAmount: string | undefined;
        finalBalance: string | undefined;
    }>;
    findSales(id: string, query?: ListCustomerSalesQueryDto): Promise<{
        items: {
            id: string;
            saleNumber: string;
            createdAt: Date;
            total: string;
            paymentType: import("@prisma/client").$Enums.SalePaymentType;
            collectionStatus: import("@prisma/client").$Enums.CollectionStatus;
            status: import("@prisma/client").$Enums.SaleStatus;
            locationId: string;
            paymentsSummary: {
                totalPaid: string;
                lastPaidAt: Date | null;
                methods: import("@prisma/client").$Enums.PaymentMethod[];
            };
            accountReceivableId: string | null;
            billingRequestId: string | null;
        }[];
    }>;
    findPayments(id: string, query?: ListCustomerPaymentsQueryDto): Promise<{
        items: {
            id: string;
            accountReceivableId: string | null;
            saleId: string | null;
            amount: string;
            paymentMethod: import("@prisma/client").$Enums.PaymentMethod;
            bankName: string | null;
            referenceNumber: string | null;
            appliedDocumentId: string | null;
            appliedDocumentType: string | null;
            routeId: string | null;
            routeSettlementId: string | null;
            status: import("@prisma/client").$Enums.PaymentStatus;
            paidAt: Date;
        }[];
    }>;
    create(dto: CreateCustomerDto, currentUser?: AuthenticatedUser): Promise<CustomerResponse>;
    update(id: string, dto: UpdateCustomerDto, currentUser?: AuthenticatedUser): Promise<CustomerResponse>;
    deactivate(id: string): Promise<CustomerResponse>;
    private buildListWhere;
    private buildAgingWhere;
    private buildDateRangeWhere;
    private buildPagination;
    private findCustomerDetail;
    private assertCustomerExists;
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
    private buildCreditSummaryResponse;
    private resolveAgingStatus;
    private resolveCollectionStatus;
    private activeReceivables;
    private customerPayments;
    private resolveBlockingReason;
    private toSaleHistoryItem;
    private toPaymentHistoryItem;
    private buildBillingSummary;
    private throwUniqueConflict;
    private isUniqueConstraintError;
}
export {};
