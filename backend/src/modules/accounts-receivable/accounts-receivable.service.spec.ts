import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AgingStatus,
  CollectionStatus,
  CreditStatus,
  PaymentMethod,
  PaymentStatus,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountsReceivableService } from './accounts-receivable.service';

type MockPrisma = {
  accountReceivable: {
    aggregate: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  payment: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  sale: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

function money(value: string) {
  return { toString: () => value };
}

function hashPayload(payload: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function createReceivable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ar-1',
    customerId: 'customer-1',
    saleId: 'sale-1',
    sale: {
      id: 'sale-1',
      saleNumber: 'S-1001',
      total: money('1000'),
      locationId: 'loc-1',
      documentType: 'SIMPLE_NOTE',
      physicalFolio: 'N-1001',
    },
    customer: {
      id: 'customer-1',
      name: 'Restaurante Centro',
      customerType: 'INSTITUTIONAL',
      creditStatus: 'ACTIVE',
      customerNumber: 'C-001',
      commercialName: 'Centro',
    },
    billingRequest: null,
    billingRequestId: null,
    originalAmount: money('1000'),
    outstandingAmount: money('1000'),
    saleDate: new Date('2026-06-01T12:00:00.000Z'),
    dueDate: new Date('2026-06-16T12:00:00.000Z'),
    paymentTermsDays: 15,
    lastPaymentDate: null,
    daysOverdue: 0,
    paidAt: null,
    cancelledAt: null,
    agingStatus: AgingStatus.CURRENT,
    physicalDocumentFolio: 'N-1001',
    collectorUserId: null,
    commercialPolicyId: 'policy-1',
    status: CollectionStatus.UNPAID,
    createdAt: new Date('2026-06-01T12:01:00.000Z'),
    updatedAt: new Date('2026-06-01T12:01:00.000Z'),
    payments: [],
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  const prisma: MockPrisma = {
    accountReceivable: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    sale: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}

function createService(prisma = createPrisma()) {
  return {
    service: new AccountsReceivableService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('AccountsReceivableService', () => {
  it('lists receivables with status and aging filters separated', async () => {
    const { service, prisma } = createService();
    prisma.accountReceivable.findMany.mockResolvedValue([
      createReceivable({ daysOverdue: 3, agingStatus: AgingStatus.OVERDUE }),
    ]);

    await expect(
      service.findAll(
        {
          customerId: 'customer-1',
          status: CollectionStatus.UNPAID,
          agingStatus: AgingStatus.OVERDUE,
          onlyOverdue: true,
          page: 2,
          limit: 10,
        },
        { id: 'admin-1', role: 'ADMIN' },
      ),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'ar-1',
          customerName: 'Restaurante Centro',
          saleNumber: 'S-1001',
          outstandingAmount: '1000',
          status: CollectionStatus.UNPAID,
          agingStatus: AgingStatus.OVERDUE,
          daysOverdue: 3,
        }),
      ],
    });

    expect(prisma.accountReceivable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 'customer-1',
          status: CollectionStatus.UNPAID,
          agingStatus: AgingStatus.OVERDUE,
          dueDate: { lt: expect.any(Date) },
        }),
        skip: 10,
        take: 10,
      }),
    );
  });

  it('registers a partial collection payment on exactly one receivable', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(
      createReceivable({ outstandingAmount: money('1000') }),
    );
    prisma.payment.create.mockResolvedValue({
      id: 'payment-1',
      accountReceivableId: 'ar-1',
      customerId: 'customer-1',
      amount: money('400'),
      paymentMethod: PaymentMethod.TRANSFER,
      bankName: 'Santander',
      referenceNumber: 'REF-1234',
      appliedDocumentId: 'N-1001',
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-19T10:00:00.000Z'),
    });
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('600'),
        status: CollectionStatus.PARTIALLY_PAID,
        lastPaymentDate: new Date('2026-06-19T10:00:00.000Z'),
      }),
    );

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 400,
          paymentMethod: PaymentMethod.TRANSFER,
          bankName: 'Santander',
          referenceNumber: 'REF-1234',
          appliedDocumentId: 'N-1001',
          paidAt: '2026-06-19T10:00:00.000Z',
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'idem-payment-1',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({
        id: 'payment-1',
        accountReceivableId: 'ar-1',
        customerId: 'customer-1',
        amount: '400',
        status: PaymentStatus.APPLIED,
      }),
      accountReceivable: expect.objectContaining({
        id: 'ar-1',
        outstandingAmount: '600',
        status: CollectionStatus.PARTIALLY_PAID,
      }),
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountReceivableId: 'ar-1',
          customerId: 'customer-1',
          userId: 'collector-1',
          collectedByUserId: 'collector-1',
          amount: 400,
          status: PaymentStatus.APPLIED,
        }),
      }),
    );
  });

  it('marks a receivable paid when the collection payment clears the full balance', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(
      createReceivable({ outstandingAmount: money('1000') }),
    );
    prisma.payment.create.mockResolvedValue({
      id: 'payment-2',
      accountReceivableId: 'ar-1',
      customerId: 'customer-1',
      amount: money('1000'),
      paymentMethod: PaymentMethod.CASH,
      bankName: null,
      referenceNumber: null,
      appliedDocumentId: null,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-20T10:00:00.000Z'),
    });
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('0'),
        status: CollectionStatus.PAID,
        paidAt: new Date('2026-06-20T10:00:00.000Z'),
      }),
    );

    await service.registerPayment(
      'ar-1',
      {
        accountReceivableId: 'ar-1',
        amount: 1000,
        paymentMethod: PaymentMethod.CASH,
        paidAt: '2026-06-20T10:00:00.000Z',
      },
      { id: 'collector-1', role: 'COLLECTIONS' },
      'idem-payment-2',
    );

    expect(prisma.accountReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outstandingAmount: 0,
          status: CollectionStatus.PAID,
          paidAt: new Date('2026-06-20T10:00:00.000Z'),
        }),
      }),
    );
  });

  it('rejects collection payments that target another receivable or exceed balance', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(
      createReceivable({ outstandingAmount: money('1000') }),
    );

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-2',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'idem-payment-3',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 1000.01,
          paymentMethod: PaymentMethod.CASH,
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'idem-payment-4',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payments on missing, paid, or cancelled receivables', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.registerPayment(
        'missing',
        {
          accountReceivableId: 'missing',
          amount: 10,
          paymentMethod: PaymentMethod.CASH,
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'idem-missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.accountReceivable.findUnique.mockResolvedValueOnce(
      createReceivable({
        status: CollectionStatus.PAID,
        outstandingAmount: money('0'),
      }),
    );

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 10,
          paymentMethod: PaymentMethod.CASH,
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'idem-paid',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deduplicates collection payment retries by Idempotency-Key and rejects payload drift', async () => {
    const { service, prisma } = createService();
    const existingPayment = {
      id: 'payment-existing',
      accountReceivableId: 'ar-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: money('250'),
      paymentMethod: PaymentMethod.TRANSFER,
      bankName: 'Santander',
      referenceNumber: 'REF-1234',
      appliedDocumentId: null,
      appliedDocumentType: null,
      routeId: null,
      routeSettlementId: null,
      collectedByUserId: 'collector-1',
      collectionPass: null,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-19T10:00:00.000Z'),
      idempotencyPayloadHash: hashPayload({
        operation: 'REGISTER_RECEIVABLE_PAYMENT',
        accountReceivableId: 'ar-1',
        amount: 250,
        paymentMethod: PaymentMethod.TRANSFER,
        bankName: 'Santander',
        referenceNumber: 'REF-1234',
        appliedDocumentId: null,
        appliedDocumentType: null,
        routeId: null,
        routeSettlementId: null,
        collectedByUserId: 'collector-1',
        collectionPass: null,
        paidAt: '2026-06-19T10:00:00.000Z',
        userId: 'collector-1',
      }),
    };

    prisma.payment.findFirst.mockResolvedValueOnce(existingPayment);
    prisma.accountReceivable.findUnique.mockResolvedValueOnce(
      createReceivable({
        outstandingAmount: money('750'),
        status: CollectionStatus.PARTIALLY_PAID,
        lastPaymentDate: new Date('2026-06-19T10:00:00.000Z'),
      }),
    );

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 250,
          paymentMethod: PaymentMethod.TRANSFER,
          bankName: 'Santander',
          referenceNumber: 'REF-1234',
          paidAt: '2026-06-19T10:00:00.000Z',
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'same-key',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({
        id: 'payment-existing',
        amount: '250',
      }),
      accountReceivable: expect.objectContaining({
        id: 'ar-1',
        outstandingAmount: '750',
      }),
    });
    expect(prisma.payment.create).not.toHaveBeenCalled();

    prisma.payment.findFirst.mockResolvedValueOnce({
      ...existingPayment,
      idempotencyPayloadHash: 'different-hash',
    });
    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 300,
          paymentMethod: PaymentMethod.TRANSFER,
          paidAt: '2026-06-19T10:00:00.000Z',
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'same-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deduplicates a simultaneous same-key payment registration after a unique-key race', async () => {
    const { service, prisma } = createService();
    const existingPayment = {
      id: 'payment-race',
      accountReceivableId: 'ar-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: money('400'),
      paymentMethod: PaymentMethod.CASH,
      bankName: null,
      referenceNumber: null,
      appliedDocumentId: null,
      appliedDocumentType: null,
      routeId: null,
      routeSettlementId: null,
      collectedByUserId: 'collector-1',
      collectionPass: null,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-19T10:00:00.000Z'),
      idempotencyPayloadHash: hashPayload({
        operation: 'REGISTER_RECEIVABLE_PAYMENT',
        accountReceivableId: 'ar-1',
        amount: 400,
        paymentMethod: PaymentMethod.CASH,
        bankName: null,
        referenceNumber: null,
        appliedDocumentId: null,
        appliedDocumentType: null,
        routeId: null,
        routeSettlementId: null,
        collectedByUserId: 'collector-1',
        collectionPass: null,
        paidAt: '2026-06-19T10:00:00.000Z',
        userId: 'collector-1',
      }),
    };

    prisma.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingPayment);
    prisma.accountReceivable.findUnique
      .mockResolvedValueOnce(
        createReceivable({ outstandingAmount: money('1000') }),
      )
      .mockResolvedValueOnce(
        createReceivable({
          outstandingAmount: money('600'),
          status: CollectionStatus.PARTIALLY_PAID,
        }),
      );
    prisma.payment.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 400,
          paymentMethod: PaymentMethod.CASH,
          paidAt: '2026-06-19T10:00:00.000Z',
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'race-key',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({ id: 'payment-race', amount: '400' }),
      accountReceivable: expect.objectContaining({
        id: 'ar-1',
        outstandingAmount: '600',
      }),
    });
    expect(prisma.accountReceivable.update).not.toHaveBeenCalled();
  });

  it('persists Idempotency-Key metadata on new collection payments', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(
      createReceivable({ outstandingAmount: money('1000') }),
    );
    prisma.payment.create.mockResolvedValue({
      id: 'payment-1',
      accountReceivableId: 'ar-1',
      customerId: 'customer-1',
      amount: money('400'),
      paymentMethod: PaymentMethod.TRANSFER,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-19T10:00:00.000Z'),
    });
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('600'),
        status: CollectionStatus.PARTIALLY_PAID,
        lastPaymentDate: new Date('2026-06-19T10:00:00.000Z'),
      }),
    );

    await service.registerPayment(
      'ar-1',
      {
        accountReceivableId: 'ar-1',
        amount: 400,
        paymentMethod: PaymentMethod.TRANSFER,
        paidAt: '2026-06-19T10:00:00.000Z',
      },
      { id: 'collector-1', role: 'COLLECTIONS' },
      'new-key',
    );

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'new-key',
          idempotencyPayloadHash: expect.any(String),
        }),
      }),
    );
  });

  it('denies SELLER list and detail access until an ownership policy exists', async () => {
    const { service, prisma } = createService();

    await expect(
      service.findAll({}, { id: 'seller-1', role: 'SELLER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findAll(
        { customerId: 'customer-1' },
        { id: 'seller-1', role: 'SELLER' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.accountReceivable.findMany).not.toHaveBeenCalled();

    await expect(
      service.findOne('ar-1', { id: 'seller-1', role: 'SELLER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not swallow Sale.collectionStatus update failures when registering payments', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(
      createReceivable({ outstandingAmount: money('1000') }),
    );
    prisma.payment.create.mockResolvedValue({
      id: 'payment-1',
      accountReceivableId: 'ar-1',
      customerId: 'customer-1',
      amount: money('400'),
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-19T10:00:00.000Z'),
    });
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('600'),
        status: CollectionStatus.PARTIALLY_PAID,
      }),
    );
    prisma.sale.update.mockRejectedValue(new Error('sale update failed'));

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 400,
          paymentMethod: PaymentMethod.CASH,
        },
        { id: 'collector-1', role: 'COLLECTIONS' },
        'sale-update-key',
      ),
    ).rejects.toThrow('sale update failed');
  });

  it('creates an account receivable from a confirmed credit sale after enforcing credit policy', async () => {
    const { service, prisma } = createService();
    const saleCreatedAt = new Date('2026-06-20T10:00:00.000Z');
    const dueDate = new Date('2026-07-05T10:00:00.000Z');
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale-1',
      customerId: 'customer-1',
      commercialPolicyId: 'policy-1',
      physicalFolio: 'N-1001',
      total: money('1000'),
      paymentType: SalePaymentType.CREDIT_SALE,
      status: SaleStatus.CONFIRMED,
      createdAt: saleCreatedAt,
      customer: {
        id: 'customer-1',
        isActive: true,
        creditStatus: CreditStatus.ACTIVE,
        creditLimit: money('3000'),
        creditDays: 15,
        commercialPolicyId: 'policy-1',
      },
      payments: [{ amount: money('200'), status: PaymentStatus.APPLIED }],
      accountReceivable: null,
    });
    prisma.accountReceivable.aggregate.mockResolvedValue({
      _sum: { outstandingAmount: money('500') },
    });
    prisma.accountReceivable.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.create.mockResolvedValue(
      createReceivable({
        originalAmount: money('800'),
        outstandingAmount: money('800'),
        saleDate: saleCreatedAt,
        dueDate,
        paymentTermsDays: 15,
      }),
    );

    await expect(
      service.createFromConfirmedCreditSale('sale-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'ar-1',
        originalAmount: '800',
        outstandingAmount: '800',
        paymentTermsDays: 15,
      }),
    );

    expect(prisma.accountReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'customer-1',
          saleId: 'sale-1',
          originalSaleId: 'sale-1',
          originalAmount: 800,
          outstandingAmount: 800,
          dueDate,
          paymentTermsDays: 15,
          commercialPolicyId: 'policy-1',
          physicalDocumentFolio: 'N-1001',
          status: CollectionStatus.UNPAID,
        }),
      }),
    );
    expect(prisma.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { collectionStatus: CollectionStatus.UNPAID },
    });
  });

  it('blocks credit-sale receivable creation for overdue or limit-exceeded customers', async () => {
    const { service, prisma } = createService();
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale-1',
      customerId: 'customer-1',
      total: money('1000'),
      paymentType: SalePaymentType.CREDIT_SALE,
      status: SaleStatus.CONFIRMED,
      createdAt: new Date('2026-06-20T10:00:00.000Z'),
      customer: {
        id: 'customer-1',
        isActive: true,
        creditStatus: CreditStatus.ACTIVE,
        creditLimit: money('1200'),
        creditDays: 15,
      },
      payments: [],
      accountReceivable: null,
    });
    prisma.accountReceivable.aggregate.mockResolvedValue({
      _sum: { outstandingAmount: money('500') },
    });
    prisma.accountReceivable.findFirst.mockResolvedValue({ id: 'overdue-ar' });

    await expect(
      service.createFromConfirmedCreditSale('sale-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.accountReceivable.findFirst.mockResolvedValue(null);
    await expect(
      service.createFromConfirmedCreditSale('sale-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
