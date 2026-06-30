import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto';
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
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                email: string | null;
                isActive: boolean;
                address: string | null;
                customerNumber: string | null;
                commercialName: string | null;
                phone: string | null;
                billingEmail: string | null;
                customerType: import("@prisma/client").$Enums.CustomerType;
                priceListId: string | null;
                creditLimit: import("@prisma/client/runtime/library").Decimal | null;
                creditDays: number | null;
                creditStatus: import("@prisma/client").$Enums.CreditStatus;
                requiresBilling: boolean;
                fiscalName: string | null;
                taxId: string | null;
                fiscalAddress: string | null;
                deliveryAddress: string | null;
                assignedRouteId: string | null;
                commercialPolicyId: string | null;
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
    findOne(id: string): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            isActive: boolean;
            address: string | null;
            customerNumber: string | null;
            commercialName: string | null;
            phone: string | null;
            billingEmail: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            priceListId: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            assignedRouteId: string | null;
            commercialPolicyId: string | null;
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
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            isActive: boolean;
            address: string | null;
            customerNumber: string | null;
            commercialName: string | null;
            phone: string | null;
            billingEmail: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            priceListId: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            assignedRouteId: string | null;
            commercialPolicyId: string | null;
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
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            isActive: boolean;
            address: string | null;
            customerNumber: string | null;
            commercialName: string | null;
            phone: string | null;
            billingEmail: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            priceListId: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            assignedRouteId: string | null;
            commercialPolicyId: string | null;
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
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            isActive: boolean;
            address: string | null;
            customerNumber: string | null;
            commercialName: string | null;
            phone: string | null;
            billingEmail: string | null;
            customerType: import("@prisma/client").$Enums.CustomerType;
            priceListId: string | null;
            creditLimit: import("@prisma/client/runtime/library").Decimal | null;
            creditDays: number | null;
            creditStatus: import("@prisma/client").$Enums.CreditStatus;
            requiresBilling: boolean;
            fiscalName: string | null;
            taxId: string | null;
            fiscalAddress: string | null;
            deliveryAddress: string | null;
            assignedRouteId: string | null;
            commercialPolicyId: string | null;
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
