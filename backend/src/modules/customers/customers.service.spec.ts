import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AgingStatus,
  CollectionStatus,
  CreditStatus,
  CustomerType,
  PaymentMethod,
  PaymentStatus,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CustomersService } from './customers.service';

type CustomerRecord = {
  id: string;
  customerNumber: string | null;
  name: string;
  commercialName: string | null;
  phone: string | null;
  email: string | null;
  billingEmail: string | null;
  address: string | null;
  customerType: CustomerType;
  priceListId: string | null;
  creditLimit: { toString(): string } | null;
  creditDays: number | null;
  creditStatus: CreditStatus;
  requiresBilling: boolean;
  fiscalName: string | null;
  taxId: string | null;
  fiscalAddress: string | null;
  deliveryAddress: string | null;
  assignedRouteId: string | null;
  commercialPolicyId: string | null;
  isActive: boolean;
  commercialPolicy?: unknown;
  accountReceivables?: Array<{
    originalAmount: { toString(): string };
    outstandingAmount: { toString(): string };
    daysOverdue: number;
    lastPaymentDate: Date | null;
    agingStatus?: AgingStatus;
    status?: CollectionStatus;
  }>;
  payments?: Array<{ amount: { toString(): string }; paidAt: Date }>;
  billingRequests?: Array<{ status: string }>;
};

const adminUser: AuthenticatedUser = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  mustChangePassword: false,
};

const sellerUser: AuthenticatedUser = {
  id: 'seller-1',
  name: 'Seller User',
  email: 'seller@pollos.local',
  role: 'SELLER',
  mustChangePassword: false,
};

type MockPrisma = {
  customer: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  sale: { findMany: jest.Mock };
  payment: { findMany: jest.Mock };
};

function money(value: string) {
  return { toString: () => value };
}

function createCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'customer-1',
    customerNumber: 'C-1024',
    name: 'Restaurante El Centro',
    commercialName: 'El Centro',
    phone: '2290000000',
    email: 'cliente@example.com',
    billingEmail: 'facturacion@cliente.com',
    address: 'Customer address',
    customerType: CustomerType.INSTITUTIONAL,
    priceListId: 'price-list-1',
    creditLimit: money('50000'),
    creditDays: 15,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    fiscalName: 'Razón social opcional',
    taxId: 'RFC123456789',
    fiscalAddress: 'Fiscal address',
    deliveryAddress: 'Delivery address',
    assignedRouteId: 'route-1',
    commercialPolicyId: 'policy-1',
    isActive: true,
    commercialPolicy: null,
    accountReceivables: [],
    payments: [],
    billingRequests: [],
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  return {
    customer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sale: { findMany: jest.fn() },
    payment: { findMany: jest.fn() },
  };
}

function createService(prisma = createPrisma()) {
  return {
    service: new CustomersService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('CustomersService', () => {
  it('lists customers with documented filters and preserves commercial terms', async () => {
    const { service, prisma } = createService();
    prisma.customer.findMany.mockResolvedValue([
      createCustomer(),
      createCustomer({
        id: 'customer-2',
        name: 'Tienda La Esquina',
        customerType: CustomerType.RETAIL,
        creditLimit: null,
        creditDays: null,
        requiresBilling: false,
        fiscalName: null,
        taxId: null,
        fiscalAddress: null,
      }),
    ]);

    await expect(
      service.findAll({
        page: 2,
        limit: 10,
        search: 'centro',
        customerType: CustomerType.INSTITUTIONAL,
        creditStatus: CreditStatus.ACTIVE,
        commercialPolicyId: 'policy-1',
        assignedRouteId: 'route-1',
        isActive: true,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'customer-1',
          customerType: CustomerType.INSTITUTIONAL,
          creditLimit: '50000',
          creditDays: 15,
          priceListId: 'price-list-1',
          deliveryAddress: 'Delivery address',
          fiscalName: 'Razón social opcional',
          requiresBilling: true,
          isBlockedForCredit: false,
        }),
        expect.objectContaining({
          id: 'customer-2',
          customerType: CustomerType.RETAIL,
          fiscalName: null,
          requiresBilling: false,
        }),
      ],
    });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        commercialPolicy: true,
        accountReceivables: { include: { payments: true } },
        payments: true,
        billingRequests: true,
      },
      where: expect.objectContaining({
        isActive: true,
        customerType: CustomerType.INSTITUTIONAL,
        creditStatus: CreditStatus.ACTIVE,
        commercialPolicyId: 'policy-1',
        assignedRouteId: 'route-1',
        OR: expect.arrayContaining([
          { name: { contains: 'centro', mode: 'insensitive' } },
          { phone: { contains: 'centro', mode: 'insensitive' } },
        ]),
      }),
      orderBy: { name: 'asc' },
      skip: 10,
      take: 10,
    }));
  });

  it('gets customer detail by id with optional fiscal fields treated as commercial data only', async () => {
    const { service, prisma } = createService();
    prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());

    await expect(service.findOne('customer-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'customer-1',
        fiscalName: 'Razón social opcional',
        taxId: 'RFC123456789',
        requiresBilling: true,
        commercialPolicy: null,
        creditSummary: expect.objectContaining({
          creditLimit: '50000',
          availableCredit: '50000',
          outstandingAmount: '0',
        }),
        billingSummary: expect.objectContaining({
          billedAmount: '0',
          paidAmount: '0',
          finalBalance: '0',
          openAdministrativeOrders: 0,
        }),
      }),
    );

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      include: {
        commercialPolicy: true,
        accountReceivables: { include: { payments: true } },
        payments: true,
        billingRequests: true,
      },
    });

    prisma.customer.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('missing-customer')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates wholesale and institutional customers while enforcing required names and unique phones', async () => {
    const { service, prisma } = createService();
    prisma.customer.findUnique.mockResolvedValueOnce(null);
    prisma.customer.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createCustomer(data as Partial<CustomerRecord>)),
    );

    await expect(
      service.create({
        name: ' Restaurante El Centro ',
        phone: ' 2290000000 ',
        email: 'cliente@example.com',
        billingEmail: 'facturacion@cliente.com',
        customerType: CustomerType.WHOLESALE,
        creditLimit: 50000,
        creditDays: 15,
        creditStatus: CreditStatus.ACTIVE,
        priceListId: 'price-list-1',
        assignedRouteId: 'route-1',
        deliveryAddress: ' Delivery address ',
        fiscalName: 'Razón social opcional',
      }, adminUser),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Restaurante El Centro',
        phone: '2290000000',
        customerType: CustomerType.WHOLESALE,
        creditLimit: '50000',
        deliveryAddress: 'Delivery address',
        fiscalName: 'Razón social opcional',
        isActive: true,
      }),
    );

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Restaurante El Centro',
        phone: '2290000000',
        customerType: CustomerType.WHOLESALE,
        creditLimit: 50000,
        creditDays: 15,
        isActive: true,
      }),
    });

    await expect(service.create({ name: '   ', customerType: CustomerType.RETAIL }, adminUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.customer.findUnique.mockResolvedValueOnce(createCustomer());
    await expect(
      service.create({ name: 'Otro Cliente', phone: '2290000000', customerType: CustomerType.RETAIL }, adminUser),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates active customers, maps unique phone races, and soft-deactivates without physical delete', async () => {
    const { service, prisma } = createService();
    prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
    prisma.customer.findUnique.mockResolvedValueOnce(null);
    prisma.customer.update.mockResolvedValueOnce(
      createCustomer({ phone: '2291111111', creditStatus: CreditStatus.BLOCKED }),
    );

    await expect(
      service.update('customer-1', { phone: '2291111111', creditStatus: CreditStatus.BLOCKED }, adminUser),
    ).resolves.toEqual(expect.objectContaining({ phone: '2291111111', isBlockedForCredit: true }));
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: expect.objectContaining({ phone: '2291111111', creditStatus: CreditStatus.BLOCKED }),
    });

    prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
    prisma.customer.findUnique.mockResolvedValueOnce(createCustomer({ id: 'customer-2' }));
    await expect(service.update('customer-1', { phone: '2290000000' }, adminUser)).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
    prisma.customer.update.mockResolvedValueOnce(createCustomer({ isActive: false }));
    await expect(service.deactivate('customer-1')).resolves.toEqual(expect.objectContaining({ isActive: false }));
    expect(prisma.customer.update).toHaveBeenLastCalledWith({
      where: { id: 'customer-1' },
      data: { isActive: false },
    });
    expect(prisma.customer.delete).not.toHaveBeenCalled();
  });

  it('rejects SELLER attempts to capture or modify restricted commercial credit fields', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(
        {
          name: 'Retail Customer',
          customerType: CustomerType.RETAIL,
          creditLimit: 1000,
          creditDays: 7,
          creditStatus: CreditStatus.ACTIVE,
        },
        sellerUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
    await expect(
      service.update('customer-1', { priceListId: 'price-list-2' }, sellerUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows SELLER to maintain basic and delivery customer fields', async () => {
    const { service, prisma } = createService();
    prisma.customer.findUnique.mockResolvedValueOnce(null);
    prisma.customer.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createCustomer(data as Partial<CustomerRecord>)),
    );

    await expect(
      service.create(
        {
          name: 'Retail Customer',
          customerType: CustomerType.RETAIL,
          phone: '2291111111',
          deliveryAddress: 'Route address',
          assignedRouteId: 'route-2',
        },
        sellerUser,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Retail Customer',
        phone: '2291111111',
        deliveryAddress: 'Route address',
        assignedRouteId: 'route-2',
      }),
    );

    prisma.customer.findFirst.mockResolvedValueOnce(
      createCustomer({ creditLimit: null, creditDays: null }),
    );
    prisma.customer.update.mockResolvedValueOnce(
      createCustomer({
        deliveryAddress: 'Updated route address',
        creditLimit: null,
        creditDays: null,
      }),
    );

    await expect(
      service.update(
        'customer-1',
        { deliveryAddress: ' Updated route address ' },
        sellerUser,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        deliveryAddress: 'Updated route address',
        creditLimit: null,
        creditDays: null,
        creditStatus: CreditStatus.ACTIVE,
      }),
    );
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: expect.objectContaining({ deliveryAddress: 'Updated route address' }),
    });
  });

  it('requires coherent credit terms when a customer enters a credited state', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(
        {
          name: 'Incomplete Credit Customer',
          customerType: CustomerType.WHOLESALE,
          creditLimit: 1000,
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.customer.findFirst.mockResolvedValueOnce(
      createCustomer({ creditLimit: null, creditDays: null }),
    );
    await expect(
      service.update('customer-1', { creditStatus: CreditStatus.ACTIVE }, adminUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });


  it('filters customer list by aging status and cartera alias', async () => {
    const { service, prisma } = createService();
    prisma.customer.findMany.mockResolvedValue([createCustomer()]);

    await service.findAll({ agingStatus: AgingStatus.OVERDUE });
    expect(prisma.customer.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountReceivables: {
            some: {
              agingStatus: AgingStatus.OVERDUE,
              status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] },
            },
          },
        }),
      }),
    );

    await service.findAll({ cartera: 'LATE' });
    expect(prisma.customer.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountReceivables: {
            some: {
              daysOverdue: { gt: 0 },
              status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] },
            },
          },
        }),
      }),
    );
  });

  it('returns dedicated credit summary with aging, blocking, and billing summary', async () => {
    const { service, prisma } = createService();
    prisma.customer.findFirst.mockResolvedValueOnce(
      createCustomer({
        creditLimit: money('1000'),
        accountReceivables: [
          {
            originalAmount: money('1200'),
            outstandingAmount: money('1100'),
            daysOverdue: 3,
            lastPaymentDate: null,
            agingStatus: AgingStatus.OVERDUE,
            status: CollectionStatus.PARTIALLY_PAID,
          },
        ],
        payments: [{ amount: money('100'), paidAt: new Date('2026-06-29T10:00:00.000Z') }],
      }),
    );

    await expect(service.getCreditSummary('customer-1')).resolves.toEqual(
      expect.objectContaining({
        customerId: 'customer-1',
        creditStatus: CreditStatus.ACTIVE,
        creditLimit: '1000',
        paymentTermsDays: 15,
        agingStatus: AgingStatus.OVERDUE,
        collectionStatus: CollectionStatus.PARTIALLY_PAID,
        globalBalance: '1100',
        overdueAmount: '1100',
        availableCredit: '0',
        hasOverdueBalance: true,
        isBlocked: true,
        blockingReason: 'OVERDUE_BALANCE',
        daysOverdue: 3,
        billingSummary: expect.objectContaining({ finalBalance: '1100' }),
      }),
    );
  });

  it('returns customer sales history with payment summary and traceability ids', async () => {
    const { service, prisma } = createService();
    prisma.customer.findFirst.mockResolvedValueOnce({ id: 'customer-1' });
    prisma.sale.findMany.mockResolvedValueOnce([
      {
        id: 'sale-1',
        saleNumber: 'S-1',
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        total: money('250'),
        paymentType: SalePaymentType.CREDIT_SALE,
        collectionStatus: CollectionStatus.PARTIALLY_PAID,
        status: SaleStatus.CONFIRMED,
        locationId: 'location-1',
        payments: [
          { amount: money('50'), paidAt: new Date('2026-06-30T13:00:00.000Z'), paymentMethod: PaymentMethod.CASH },
        ],
        accountReceivable: { id: 'ar-1' },
        billingRequest: { id: 'billing-1' },
      },
    ]);

    await expect(
      service.findSales('customer-1', { paymentType: SalePaymentType.CREDIT_SALE }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'sale-1',
          accountReceivableId: 'ar-1',
          billingRequestId: 'billing-1',
          paymentsSummary: expect.objectContaining({ totalPaid: '50', methods: [PaymentMethod.CASH] }),
        }),
      ],
    });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: 'customer-1' }) }),
    );
  });

  it('returns customer payment history through direct or account receivable relation', async () => {
    const { service, prisma } = createService();
    prisma.customer.findFirst.mockResolvedValueOnce({ id: 'customer-1' });
    prisma.payment.findMany.mockResolvedValueOnce([
      {
        id: 'payment-1',
        accountReceivableId: 'ar-1',
        saleId: 'sale-1',
        amount: money('75'),
        paymentMethod: PaymentMethod.TRANSFER,
        bankName: 'Bank',
        referenceNumber: 'REF-1',
        appliedDocumentId: 'doc-1',
        appliedDocumentType: 'ACCOUNT_RECEIVABLE',
        routeId: 'route-1',
        routeSettlementId: 'settlement-1',
        status: PaymentStatus.APPLIED,
        paidAt: new Date('2026-06-30T14:00:00.000Z'),
      },
    ]);

    await expect(
      service.findPayments('customer-1', { paymentMethod: PaymentMethod.TRANSFER }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'payment-1',
          accountReceivableId: 'ar-1',
          saleId: 'sale-1',
          routeId: 'route-1',
          routeSettlementId: 'settlement-1',
        }),
      ],
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { customerId: 'customer-1' },
            { sale: { customerId: 'customer-1' } },
            { accountReceivable: { customerId: 'customer-1' } },
          ],
        }),
      }),
    );
  });

});
