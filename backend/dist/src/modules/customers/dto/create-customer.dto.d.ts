import { CreditStatus, CustomerType } from '@prisma/client';
export declare class CreateCustomerDto {
    customerNumber?: string;
    name: string;
    commercialName?: string;
    phone?: string;
    email?: string;
    billingEmail?: string;
    address?: string;
    customerType: CustomerType;
    priceListId?: string;
    creditLimit?: number;
    creditDays?: number;
    creditStatus?: CreditStatus;
    requiresBilling?: boolean;
    fiscalName?: string;
    taxId?: string;
    fiscalAddress?: string;
    deliveryAddress?: string;
    assignedRouteId?: string;
    commercialPolicyId?: string;
}
