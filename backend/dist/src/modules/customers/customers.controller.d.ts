import { CreateCustomerDto, ListCustomerPaymentsQueryDto, ListCustomerSalesQueryDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto';
import { CustomersService } from './customers.service';
import type { AuthenticatedUser } from '../auth/auth.types';
export declare class CustomersController {
    private readonly customersService;
    constructor(customersService: CustomersService);
    findAll(query: ListCustomersQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: (Omit<{
                email: string | null;
                assignedRouteId: string | null;
                billingEmail: string | null;
                commercialName: string | null;
                customerType: import("@prisma/client").$Enums.CustomerType;
                commercialPolicyId: string | null;
                id: string;
                name: string;
                isActive: boolean;
                createdAt: Date;
                updatedAt: Date;
                address: string | null;
                priceListId: string | null;
                phone: string | null;
                customerNumber: string | null;
                creditLimit: import("@prisma/client/runtime/library").Decimal | null;
                creditDays: number | null;
                creditStatus: import("@prisma/client").$Enums.CreditStatus;
                requiresBilling: boolean;
                fiscalName: string | null;
                taxId: string | null;
                fiscalAddress: string | null;
                deliveryAddress: string | null;
                notes: string | null;
            }, "creditLimit"> & {
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
                    creditStatus: import("@prisma/client").CreditStatus;
                    isBlockedForCredit: boolean;
                };
                billingSummary?: {
                    billedAmount: string;
                    paidAmount: string;
                    finalBalance: string;
                    openAdministrativeOrders: number;
                };
            })[];
        };
    }>;
    getCreditSummary(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
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
        };
    }>;
    findSales(id: string, query: ListCustomerSalesQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
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
        };
    }>;
    findPayments(id: string, query: ListCustomerPaymentsQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
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
        };
    }>;
    findOne(id: string): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            email: string | null;
            assignedRouteId: string | null;
            billingEmail: string | null;
            commercialName: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            commercialPolicyId: string | null;
            id: string;
            name: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            address: string | null;
            priceListId: string | null;
            phone: string | null;
            customerNumber: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            notes: string | null;
        }, "creditLimit"> & {
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
                creditStatus: import("@prisma/client").CreditStatus;
                isBlockedForCredit: boolean;
            };
            billingSummary?: {
                billedAmount: string;
                paidAmount: string;
                finalBalance: string;
                openAdministrativeOrders: number;
            };
        };
    }>;
    create(body: CreateCustomerDto, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            email: string | null;
            assignedRouteId: string | null;
            billingEmail: string | null;
            commercialName: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            commercialPolicyId: string | null;
            id: string;
            name: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            address: string | null;
            priceListId: string | null;
            phone: string | null;
            customerNumber: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            notes: string | null;
        }, "creditLimit"> & {
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
                creditStatus: import("@prisma/client").CreditStatus;
                isBlockedForCredit: boolean;
            };
            billingSummary?: {
                billedAmount: string;
                paidAmount: string;
                finalBalance: string;
                openAdministrativeOrders: number;
            };
        };
    }>;
    update(id: string, body: UpdateCustomerDto, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            email: string | null;
            assignedRouteId: string | null;
            billingEmail: string | null;
            commercialName: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            commercialPolicyId: string | null;
            id: string;
            name: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            address: string | null;
            priceListId: string | null;
            phone: string | null;
            customerNumber: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            notes: string | null;
        }, "creditLimit"> & {
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
                creditStatus: import("@prisma/client").CreditStatus;
                isBlockedForCredit: boolean;
            };
            billingSummary?: {
                billedAmount: string;
                paidAmount: string;
                finalBalance: string;
                openAdministrativeOrders: number;
            };
        };
    }>;
    deactivate(id: string): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            email: string | null;
            assignedRouteId: string | null;
            billingEmail: string | null;
            commercialName: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            commercialPolicyId: string | null;
            id: string;
            name: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            address: string | null;
            priceListId: string | null;
            phone: string | null;
            customerNumber: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            notes: string | null;
        }, "creditLimit"> & {
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
                creditStatus: import("@prisma/client").CreditStatus;
                isBlockedForCredit: boolean;
            };
            billingSummary?: {
                billedAmount: string;
                paidAmount: string;
                finalBalance: string;
                openAdministrativeOrders: number;
            };
        };
    }>;
}
