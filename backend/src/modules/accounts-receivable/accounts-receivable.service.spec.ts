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
  Prisma,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
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
  cashShift: { findUnique: jest.Mock };
  pointOfSaleDailyClose: { findUnique: jest.Mock; findFirst: jest.Mock };
  $executeRawUnsafe: jest.Mock;
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
      findUnique: jest.fn().mockResolvedValue({ locationId: 'loc-1' }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    cashShift: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'shift-1',
        operationalLocationId: 'loc-1',
        pointOfSaleDailyCloseId: 'close-1',
        cashierUserId: 'collector-1',
        status: 'OPEN',
        terminal: { deviceId: 'device-1', isActive: true },
        pointOfSaleDailyClose: { status: 'DRAFT' },
      }),
    },
    pointOfSaleDailyClose: {
      findUnique: jest.fn().mockResolvedValue({ status: 'DRAFT' }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'close-1',
        operationalLocationId: 'loc-1',
        status: 'DRAFT',
        cashSessionStatus: 'OPEN',
      }),
    },
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn((callback) => callback(prisma)),
  };
  return prisma;
}

function createService(prisma = createPrisma()) {
  const dailyCloseService = {
    recalculateAfterDraftMutation: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new AccountsReceivableService(
      prisma as unknown as PrismaService,
      dailyCloseService as unknown as PointOfSaleDailyCloseService,
    ),
    prisma,
    dailyCloseService,
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
          outstandingAmount: '1000.00',
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
          amount: '400.00',
          paymentMethod: PaymentMethod.TRANSFER,
          bankName: 'Santander',
          referenceNumber: 'REF-1234',
          appliedDocumentId: 'N-1001',
          paidAt: '2026-06-19T10:00:00.000Z',
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [],
        },
        'idem-payment-1',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({
        id: 'payment-1',
        accountReceivableId: 'ar-1',
        customerId: 'customer-1',
        amount: '400.00',
        status: PaymentStatus.APPLIED,
      }),
      accountReceivable: expect.objectContaining({
        id: 'ar-1',
        outstandingAmount: '600.00',
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
          amount: '400.00',
          status: PaymentStatus.APPLIED,
        }),
      }),
    );
  });

  it('rejects a cash collection payment when the cashier has no open shift', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(createReceivable());

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-payment-no-cash-session',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CASH_SHIFT_REQUIRED' }),
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('rejects fixed cash collection without the fixed-cash permission', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(createReceivable());

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
        },
        { id: 'collector-1', role: 'COLLECTIONS', permissions: [] },
        'idem-payment-without-cash-permission',
      ),
    ).rejects.toThrow('COLLECTIONS_CASH_PERMISSION_REQUIRED');

    expect(prisma.cashShift.findUnique).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('rechaza registrar efectivo cuando el cierre POS ya fue revisado', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(createReceivable());
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      cashierUserId: 'collector-1',
      status: 'OPEN',
      terminal: { deviceId: 'device-1', isActive: true },
      pointOfSaleDailyClose: { status: 'REVIEWED' },
    });
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      status: 'REVIEWED',
    });

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-payment-reviewed-close',
      ),
    ).rejects.toThrow('DAILY_CLOSE_REOPEN_REQUIRED');

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('registra efectivo en el cierre del turno actual aunque la venta pertenezca a otro cierre', async () => {
    const { service, prisma, dailyCloseService } = createService();
    const sale = {
      locationId: 'loc-1',
      pointOfSaleDailyClose: { id: 'close-reviewed', status: 'REVIEWED' },
    };
    const foreignShift = {
      id: 'shift-foreign',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-draft',
      cashierUserId: 'collector-1',
      status: 'OPEN',
      terminal: { deviceId: 'device-1', isActive: true },
      pointOfSaleDailyClose: { status: 'DRAFT' },
    };
    const createdPayment = {
      id: 'payment-cross-close',
      accountReceivableId: 'ar-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: money('100'),
      paymentMethod: PaymentMethod.CASH,
      bankName: null,
      referenceNumber: null,
      appliedDocumentId: null,
      appliedDocumentType: null,
      routeId: null,
      routeSettlementId: null,
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-draft',
      collectedByUserId: 'collector-1',
      collectionPass: null,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-20T10:00:00.000Z'),
    };
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(createReceivable());
    prisma.sale.findUnique.mockResolvedValue(sale);
    prisma.cashShift.findUnique.mockResolvedValue(foreignShift);
    prisma.pointOfSaleDailyClose.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'close-reviewed'
            ? { status: 'REVIEWED' }
            : { status: 'DRAFT' },
        ),
    );
    prisma.payment.create.mockResolvedValue(createdPayment);
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('900'),
        status: CollectionStatus.PARTIALLY_PAID,
      }),
    );

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
          cashShiftId: 'shift-foreign',
          deviceId: 'device-1',
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-cross-close-payment',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        payment: expect.objectContaining({
          id: 'payment-cross-close',
          pointOfSaleDailyCloseId: 'close-draft',
        }),
      }),
    );

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-draft',
    );
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-reviewed',
    );
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pointOfSaleDailyCloseId: 'close-draft',
          cashShiftId: 'shift-foreign',
        }),
      }),
    );
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledWith('close-draft', prisma);
  });

  it('registra una transferencia posterior aunque el cierre de la venta esté cerrado', async () => {
    const { service, prisma, dailyCloseService } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(
      createReceivable({ outstandingAmount: money('124') }),
    );
    prisma.sale.findUnique.mockResolvedValue({
      locationId: 'loc-1',
      pointOfSaleDailyClose: { id: 'sale-close-closed', status: 'CLOSED' },
    });
    prisma.payment.create.mockResolvedValue({
      id: 'payment-transfer-after-close',
      accountReceivableId: 'ar-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: money('10'),
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-20T10:00:00.000Z'),
      pointOfSaleDailyCloseId: null,
    });
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('114'),
        status: CollectionStatus.PARTIALLY_PAID,
      }),
    );

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 10,
          paymentMethod: PaymentMethod.TRANSFER,
          cashShiftId: 'shift-ignored',
          deviceId: 'device-ignored',
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-transfer-after-close',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        payment: expect.objectContaining({
          id: 'payment-transfer-after-close',
          pointOfSaleDailyCloseId: null,
        }),
        accountReceivable: expect.objectContaining({
          outstandingAmount: '114.00',
        }),
      }),
    );

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).not.toHaveBeenCalled();
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pointOfSaleDailyCloseId: null,
          cashShiftId: null,
          operationalLocationId: 'loc-1',
        }),
      }),
    );
  });

  it('mantiene los cobros de ruta fuera del cierre POS', async () => {
    const { service, prisma, dailyCloseService } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(createReceivable());
    prisma.sale.findUnique.mockResolvedValue({
      locationId: 'route-stock-1',
      pointOfSaleDailyClose: { id: 'sale-close-closed', status: 'CLOSED' },
    });
    prisma.payment.create.mockResolvedValue({
      id: 'payment-route',
      accountReceivableId: 'ar-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: money('100'),
      paymentMethod: PaymentMethod.CASH,
      routeId: 'route-1',
      routeSettlementId: 'settlement-1',
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-20T10:00:00.000Z'),
      pointOfSaleDailyCloseId: null,
    });
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('900'),
        status: CollectionStatus.PARTIALLY_PAID,
      }),
    );

    await service.registerPayment(
      'ar-1',
      {
        accountReceivableId: 'ar-1',
        amount: 100,
        paymentMethod: PaymentMethod.CASH,
        routeId: 'route-1',
        routeSettlementId: 'settlement-1',
      },
      {
        id: 'collector-1',
        role: 'COLLECTIONS',
        permissions: [],
      },
      'idem-route-payment',
    );

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeId: 'route-1',
          routeSettlementId: 'settlement-1',
          pointOfSaleDailyCloseId: null,
          cashShiftId: null,
        }),
      }),
    );
    expect(prisma.cashShift.findUnique).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).not.toHaveBeenCalled();
  });

  it('registra el pago cuando la venta y el turno pertenecen al mismo cierre', async () => {
    const { service, prisma, dailyCloseService } = createService();
    const sale = {
      locationId: 'loc-1',
      pointOfSaleDailyClose: { id: 'close-1', status: 'DRAFT' },
    };
    const shift = {
      id: 'shift-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      cashierUserId: 'collector-1',
      status: 'OPEN',
      terminal: { deviceId: 'device-1', isActive: true },
      pointOfSaleDailyClose: { status: 'DRAFT' },
    };
    const createdPayment = {
      id: 'payment-same-close',
      accountReceivableId: 'ar-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: money('100'),
      paymentMethod: PaymentMethod.CASH,
      bankName: null,
      referenceNumber: null,
      appliedDocumentId: null,
      appliedDocumentType: null,
      routeId: null,
      routeSettlementId: null,
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      collectedByUserId: 'collector-1',
      collectionPass: null,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-20T10:00:00.000Z'),
    };
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.accountReceivable.findUnique.mockResolvedValue(createReceivable());
    prisma.sale.findUnique.mockResolvedValue(sale);
    prisma.cashShift.findUnique.mockResolvedValue(shift);
    prisma.payment.create.mockResolvedValue(createdPayment);
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('900'),
        status: CollectionStatus.PARTIALLY_PAID,
      }),
    );

    await expect(
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-same-close-payment',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        payment: expect.objectContaining({
          id: 'payment-same-close',
          pointOfSaleDailyCloseId: 'close-1',
        }),
      }),
    );

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pointOfSaleDailyCloseId: 'close-1',
          cashShiftId: 'shift-1',
        }),
      }),
    );
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledWith('close-1', prisma);
  });

  it('marks a receivable paid when the collection payment clears the full balance', async () => {
    const { service, prisma, dailyCloseService } = createService();
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
        cashShiftId: 'shift-1',
        deviceId: 'device-1',
        paidAt: '2026-06-20T10:00:00.000Z',
      },
      {
        id: 'collector-1',
        role: 'COLLECTIONS',
        permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
      },
      'idem-payment-2',
    );

    expect(prisma.accountReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outstandingAmount: '0.00',
          status: CollectionStatus.PAID,
          paidAt: new Date('2026-06-20T10:00:00.000Z'),
        }),
      }),
    );
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pointOfSaleDailyCloseId: 'close-1',
          cashShiftId: 'shift-1',
        }),
      }),
    );
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledWith('close-1', prisma);
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
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
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
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-payment-4',
      ),
    ).rejects.toThrow('Payment amount cannot exceed outstanding balance');
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
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
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
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
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
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'same-key',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({
        id: 'payment-existing',
        amount: '250.00',
      }),
      accountReceivable: expect.objectContaining({
        id: 'ar-1',
        outstandingAmount: '750.00',
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
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
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
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
          paidAt: '2026-06-19T10:00:00.000Z',
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'race-key',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({
        id: 'payment-race',
        amount: '400.00',
      }),
      accountReceivable: expect.objectContaining({
        id: 'ar-1',
        outstandingAmount: '600.00',
      }),
    });
    expect(prisma.accountReceivable.update).not.toHaveBeenCalled();
  });

  it('does not apply a second concurrent payment after a serializable conflict', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    let readers = 0;
    let releaseReaders!: () => void;
    const bothReadersStarted = new Promise<void>((resolve) => {
      releaseReaders = resolve;
    });
    prisma.accountReceivable.findUnique.mockImplementation(async () => {
      const invocation = ++readers;
      if (invocation === 2) releaseReaders();
      await bothReadersStarted;
      if (invocation === 2) {
        throw new Prisma.PrismaClientKnownRequestError(
          'Serializable transaction conflict',
          {
            code: 'P2034',
            clientVersion: '6.19.3',
          },
        );
      }
      return createReceivable({ outstandingAmount: money('100') });
    });
    prisma.payment.create.mockResolvedValue({
      id: 'payment-concurrent-winner',
      accountReceivableId: 'ar-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: money('40'),
      paymentMethod: PaymentMethod.TRANSFER,
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-06-20T10:00:00.000Z'),
    });
    prisma.accountReceivable.update.mockResolvedValue(
      createReceivable({
        outstandingAmount: money('60'),
        status: CollectionStatus.PARTIALLY_PAID,
      }),
    );

    const results = await Promise.allSettled([
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 40,
          paymentMethod: PaymentMethod.TRANSFER,
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-concurrent-winner',
      ),
      service.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 60,
          paymentMethod: PaymentMethod.TRANSFER,
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
        'idem-concurrent-loser',
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.some(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof ConflictException,
      ),
    ).toBe(true);
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(prisma.accountReceivable.update).toHaveBeenCalledTimes(1);
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
      {
        id: 'collector-1',
        role: 'COLLECTIONS',
        permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
      },
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
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
        },
        {
          id: 'collector-1',
          role: 'COLLECTIONS',
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
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
        originalAmount: '800.00',
        outstandingAmount: '800.00',
        paymentTermsDays: 15,
      }),
    );

    expect(prisma.accountReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'customer-1',
          saleId: 'sale-1',
          originalSaleId: 'sale-1',
          originalAmount: '800.00',
          outstandingAmount: '800.00',
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
