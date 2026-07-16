import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CollectionStatus,
  CreditStatus,
  InventoryMovementType,
  PaymentMethod,
  PaymentStatus,
  PointOfSaleDailyCloseStatus,
  RouteSettlementStatus,
  Prisma,
  ProductUnit,
  SaleDocumentStatus,
  SaleChannel,
  SaleDocumentType,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SalesService } from './sales.service';

const now = new Date('2026-06-21T10:00:00.000Z');

type MockPrisma = {
  $transaction: jest.Mock;
  product: { findUnique: jest.Mock };
  customer: { findUnique: jest.Mock };
  operationalLocation: { findUnique: jest.Mock };
  inventoryBalance: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
  inventoryMovement: { create: jest.Mock };
  saleDocument: { create: jest.Mock; findMany: jest.Mock };
  sale: { count: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
  payment: { create: jest.Mock; findFirst: jest.Mock };
  accountReceivable: { aggregate: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
};

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function createPrisma(): MockPrisma {
  const prisma: MockPrisma = {
    $transaction: jest.fn(async (callback) => callback(prisma)),
    product: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    operationalLocation: { findUnique: jest.fn() },
    inventoryBalance: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    saleDocument: { create: jest.fn(), findMany: jest.fn() },
    sale: { count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    payment: { create: jest.fn(), findFirst: jest.fn() },
    accountReceivable: { aggregate: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
  return prisma;
}

function createService(prisma = createPrisma()) {
  return { service: new SalesService(prisma as unknown as PrismaService), prisma };
}

function validCashSale(overrides: Record<string, unknown> = {}) {
  return {
    locationId: 'loc-1',
    saleChannel: SaleChannel.COUNTER,
    documentType: SaleDocumentType.SIMPLE_NOTE,
    paymentType: SalePaymentType.CASH_SALE,
    initialPayment: {
      amount: 250,
      paymentMethod: PaymentMethod.CASH,
      paidAt: now.toISOString(),
    },
    items: [
      {
        productId: 'product-1',
        unit: ProductUnit.KG,
        quantityKg: 2.5,
        quantityPieces: 0,
      },
    ],
    ...overrides,
  };
}

function mockHappyPath(prisma: MockPrisma, saleOverrides: Record<string, unknown> = {}) {
  prisma.sale.findUnique.mockResolvedValue(null);
  prisma.sale.count.mockResolvedValue(0);
  prisma.operationalLocation.findUnique.mockResolvedValue({
    id: 'loc-1',
    name: 'Counter',
    type: 'BRANCH',
    isActive: true,
  });
  prisma.product.findUnique.mockResolvedValue({
    id: 'product-1',
    name: 'Chicken breast',
    sku: 'PCH-001',
    unit: ProductUnit.KG,
    salePrice: decimal('100'),
    isActive: true,
    unitEquivalents: [],
  });
  prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
  prisma.inventoryBalance.findUnique.mockResolvedValue({
    productId: 'product-1',
    locationId: 'loc-1',
    quantityKg: decimal('7.500'),
    quantityPieces: 0,
  });
  prisma.sale.create.mockImplementation(({ data }) =>
    Promise.resolve({
      id: 'sale-1',
      saleNumber: data.saleNumber,
      createdAt: now,
      updatedAt: now,
      ...data,
      items: data.items.create.map((item: Record<string, unknown>) => ({ id: 'item-1', saleId: 'sale-1', ...item })),
    }),
  );
  prisma.sale.update.mockImplementation(({ data }) => Promise.resolve({ id: 'sale-1', ...data }));
  prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({ id: 'movement-1', createdAt: now, ...data }));
  prisma.payment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'payment-1', createdAt: now, updatedAt: now, ...data }));
  prisma.saleDocument.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: 'doc-1', createdAt: now, updatedAt: now, status: SaleDocumentStatus.ISSUED, ...data }),
  );
  prisma.accountReceivable.findFirst.mockResolvedValue(null);
  prisma.accountReceivable.aggregate.mockResolvedValue({ _sum: { outstandingAmount: decimal('0') } });
  prisma.accountReceivable.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ar-1', createdAt: now, updatedAt: now, ...data }));
  Object.assign(prisma.sale.create, saleOverrides);
}

describe('SalesService', () => {
  it('lists ADMIN-visible sales with filters and derives payment summaries from Payment records', async () => {
    const { service, prisma } = createService();
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        saleNumber: 'SALE-000001',
        customerId: 'customer-1',
        userId: 'seller-1',
        locationId: 'loc-1',
        saleChannel: SaleChannel.COUNTER,
        documentType: SaleDocumentType.SIMPLE_NOTE,
        physicalFolio: 'NF-10',
        requiresAdministrativeInvoice: false,
        subtotal: decimal('250'),
        discount: decimal('0'),
        tax: decimal('0'),
        total: decimal('250'),
        paymentType: SalePaymentType.CASH_SALE,
        collectionStatus: CollectionStatus.PAID,
        status: SaleStatus.CONFIRMED,
        accountReceivable: null,
        billingRequest: null,
        customer: { id: 'customer-1', name: 'Restaurant Norte' },
        payments: [
          { amount: decimal('100'), paymentMethod: PaymentMethod.CASH, paidAt: new Date('2026-06-21T12:00:00.000Z'), status: PaymentStatus.APPLIED },
          { amount: decimal('150'), paymentMethod: PaymentMethod.TRANSFER, paidAt: new Date('2026-06-21T13:00:00.000Z'), status: PaymentStatus.APPLIED },
          { amount: decimal('20'), paymentMethod: PaymentMethod.CASH, paidAt: new Date('2026-06-21T14:00:00.000Z'), status: PaymentStatus.CANCELLED },
        ],
        createdAt: now,
      },
    ]);

    const result = await service.findAll(
      {
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        customerId: 'customer-1',
        userId: 'seller-1',
        locationId: 'loc-1',
        status: SaleStatus.CONFIRMED,
        paymentMethod: PaymentMethod.CASH,
        paymentType: SalePaymentType.CASH_SALE,
        saleChannel: SaleChannel.COUNTER,
        documentType: SaleDocumentType.SIMPLE_NOTE,
        physicalFolio: 'NF-10',
      },
      { id: 'admin-1', role: 'ADMIN' },
    );

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: new Date('2026-06-01'), lte: new Date('2026-06-30') },
          customerId: 'customer-1',
          userId: 'seller-1',
          locationId: 'loc-1',
          status: SaleStatus.CONFIRMED,
          paymentType: SalePaymentType.CASH_SALE,
          saleChannel: SaleChannel.COUNTER,
          documentType: SaleDocumentType.SIMPLE_NOTE,
          physicalFolio: 'NF-10',
          payments: { some: { paymentMethod: PaymentMethod.CASH, status: PaymentStatus.APPLIED } },
        }),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'sale-1',
        customerName: 'Restaurant Norte',
        total: '250',
        paymentsSummary: {
          totalPaid: '250',
          lastPaidAt: new Date('2026-06-21T13:00:00.000Z'),
          methods: [PaymentMethod.CASH, PaymentMethod.TRANSFER],
        },
      }),
    ]);
  });

  it('scopes SELLER sales list to own userId and returns 404 for out-of-scope detail', async () => {
    const { service, prisma } = createService();
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.sale.findFirst.mockResolvedValue(null);

    await service.findAll({}, { id: 'seller-1', role: 'SELLER' });

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'seller-1' }) }),
    );
    await expect(service.findOne('sale-other', { id: 'seller-1', role: 'SELLER' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sale-other', userId: 'seller-1' } }),
    );
  });

  it('allows COLLECTIONS to query and detail only credit sales related to collections', async () => {
    const { service, prisma } = createService();
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-credit-1',
      saleNumber: 'SALE-000010',
      customerId: 'customer-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      saleChannel: SaleChannel.COUNTER,
      documentType: SaleDocumentType.SIMPLE_NOTE,
      physicalFolio: 'CR-1',
      requiresAdministrativeInvoice: false,
      subtotal: decimal('250'),
      discount: decimal('0'),
      tax: decimal('0'),
      total: decimal('250'),
      paymentType: SalePaymentType.CREDIT_SALE,
      collectionStatus: CollectionStatus.UNPAID,
      status: SaleStatus.CONFIRMED,
      customer: { id: 'customer-1', name: 'Restaurant Norte' },
      commercialPolicy: { id: 'policy-1', name: 'Wholesale 7 days' },
      accountReceivable: { id: 'ar-1', originalAmount: decimal('250'), outstandingAmount: decimal('250'), status: CollectionStatus.UNPAID },
      billingRequest: null,
      documents: [{ id: 'doc-1', documentType: SaleDocumentType.SIMPLE_NOTE, physicalFolio: 'CR-1' }],
      inventoryMovements: [{ id: 'mov-1', quantityKg: decimal('2.500'), quantityPieces: 0, saleId: 'sale-credit-1' }],
      payments: [],
      items: [{ id: 'item-1', productId: 'product-1', productNameSnapshot: 'Chicken breast', unit: ProductUnit.KG, quantityKg: decimal('2.500'), quantityPieces: 0, unitPrice: decimal('100'), subtotal: decimal('250') }],
      createdAt: now,
    });

    await service.findAll({ collectionStatus: CollectionStatus.UNPAID }, { id: 'collector-1', role: 'COLLECTIONS' });
    const detail = await service.findOne('sale-credit-1', { id: 'collector-1', role: 'COLLECTIONS' });

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentType: SalePaymentType.CREDIT_SALE,
          accountReceivable: { isNot: null },
          collectionStatus: CollectionStatus.UNPAID,
        }),
      }),
    );
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-credit-1', paymentType: SalePaymentType.CREDIT_SALE, accountReceivable: { isNot: null } },
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        id: 'sale-credit-1',
        total: '250',
        accountReceivable: expect.objectContaining({ id: 'ar-1', outstandingAmount: '250' }),
        items: [expect.objectContaining({ productName: 'Chicken breast', subtotal: '250' })],
        inventoryMovements: [expect.objectContaining({ id: 'mov-1', quantityKg: '2.5' })],
      }),
    );
  });

  it('projects only the current sale optimized route preview in authorized sale detail', async () => {
    const { service, prisma } = createService();
    const geometry = { type: 'LineString', coordinates: [[-96.14, 19.18], [-96.13, 19.17]] };
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-1', saleNumber: 'SALE-000001', userId: 'seller-1', locationId: 'loc-1',
      saleChannel: SaleChannel.COUNTER, documentType: SaleDocumentType.SIMPLE_NOTE,
      subtotal: decimal('250'), discount: decimal('0'), tax: decimal('0'), total: decimal('250'),
      paymentType: SalePaymentType.CASH_SALE, collectionStatus: CollectionStatus.PAID,
      status: SaleStatus.CONFIRMED, customer: null, commercialPolicy: null,
      accountReceivable: null, billingRequest: null, documents: [], inventoryMovements: [], payments: [], items: [],
      route: { id: 'route-1', name: 'Ruta Norte', optimizationStatus: 'OPTIMIZED', geometry, distanceMeters: 8600, durationSeconds: 1440 },
      deliveryOrder: { latitude: decimal('19.173800'), longitude: decimal('-96.134200'), stopSequence: 2 },
      createdAt: now,
    });

    const detail = await service.findOne('sale-1', { id: 'seller-1', role: 'SELLER' });

    expect(prisma.sale.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sale-1', userId: 'seller-1' },
      include: expect.objectContaining({
        route: { select: { id: true, name: true, optimizationStatus: true, geometry: true, distanceMeters: true, durationSeconds: true } },
        deliveryOrder: { select: { latitude: true, longitude: true, stopSequence: true } },
      }),
    }));
    expect(detail.routePreview).toEqual({
      id: 'route-1', name: 'Ruta Norte', geometry, mapAvailable: true,
      distanceMeters: 8600, durationSeconds: 1440,
      order: { latitude: 19.1738, longitude: -96.1342, stopSequence: 2 },
    });
    expect(detail.routePreview).not.toHaveProperty('orders');
  });

  it('returns no route preview when unassigned and an unavailable preview without geometry when not optimized', async () => {
    const { service, prisma } = createService();
    const baseSale = {
      id: 'sale-1', saleNumber: 'SALE-000001', userId: 'seller-1', locationId: 'loc-1',
      saleChannel: SaleChannel.COUNTER, documentType: SaleDocumentType.SIMPLE_NOTE,
      subtotal: decimal('250'), discount: decimal('0'), tax: decimal('0'), total: decimal('250'),
      paymentType: SalePaymentType.CASH_SALE, collectionStatus: CollectionStatus.PAID,
      status: SaleStatus.CONFIRMED, customer: null, commercialPolicy: null,
      accountReceivable: null, billingRequest: null, documents: [], inventoryMovements: [], payments: [], items: [],
      deliveryOrder: null, createdAt: now,
    };
    prisma.sale.findFirst.mockResolvedValueOnce({ ...baseSale, routeId: null, route: null });
    expect((await service.findOne('sale-1', { id: 'seller-1', role: 'SELLER' })).routePreview).toBeNull();

    prisma.sale.findFirst.mockResolvedValueOnce({
      ...baseSale, routeId: 'route-1',
      route: { id: 'route-1', name: 'Ruta histórica', optimizationStatus: 'NOT_OPTIMIZED', geometry: null, distanceMeters: null, durationSeconds: null },
    });
    expect((await service.findOne('sale-1', { id: 'seller-1', role: 'SELLER' })).routePreview).toEqual({
      id: 'route-1', name: 'Ruta histórica', geometry: null, mapAvailable: false,
      distanceMeters: null, durationSeconds: null, order: null,
    });

    for (const geometry of [
      { type: 'LineString', coordinates: [] },
      { type: 'LineString', coordinates: [[-96.14, Number.NaN], [-96.13, 19.17]] },
      { type: 'Point', coordinates: [-96.14, 19.18] },
    ]) {
      prisma.sale.findFirst.mockResolvedValueOnce({
        ...baseSale, routeId: 'route-1',
        route: { id: 'route-1', name: 'Ruta inválida', optimizationStatus: 'OPTIMIZED', geometry, distanceMeters: 100, durationSeconds: 60 },
      });
      expect((await service.findOne('sale-1', { id: 'seller-1', role: 'SELLER' })).routePreview).toEqual(expect.objectContaining({
        geometry: null,
        mapAvailable: false,
      }));
    }
  });

  it('returns an internal MVP ticket with seller, customer, location, items, totals, and payment methods from Payment records', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-1',
      saleNumber: 'SALE-000001',
      customerId: 'customer-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      saleChannel: SaleChannel.COUNTER,
      documentType: SaleDocumentType.INTERNAL_RECEIPT,
      physicalFolio: 'T-100',
      requiresAdministrativeInvoice: false,
      subtotal: decimal('250'),
      discount: decimal('10'),
      tax: decimal('0'),
      total: decimal('240'),
      paymentType: SalePaymentType.CASH_SALE,
      collectionStatus: CollectionStatus.PAID,
      status: SaleStatus.CONFIRMED,
      customer: { id: 'customer-1', name: 'Restaurant Norte' },
      user: { id: 'seller-1', name: 'Seller One' },
      location: { id: 'loc-1', name: 'Sucursal Centro' },
      documents: [
        { id: 'doc-ticket-1', documentType: SaleDocumentType.INTERNAL_RECEIPT, physicalFolio: 'T-100', createdAt: now },
      ],
      payments: [
        { id: 'payment-1', amount: decimal('240'), paymentMethod: PaymentMethod.CASH, paidAt: now, saleId: 'sale-1', accountReceivableId: null, status: PaymentStatus.APPLIED },
      ],
      items: [
        { id: 'item-1', productId: 'product-1', productNameSnapshot: 'Chicken breast', unit: ProductUnit.KG, quantityKg: decimal('2.500'), quantityPieces: 0, unitPrice: decimal('100'), subtotal: decimal('250') },
      ],
      createdAt: now,
    });

    const ticket = await service.getTicket('sale-1', { id: 'seller-1', role: 'SELLER' });

    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-1', userId: 'seller-1' },
        include: expect.objectContaining({
          customer: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          items: true,
          payments: { where: { status: PaymentStatus.APPLIED }, orderBy: { paidAt: 'desc' } },
          documents: { orderBy: { createdAt: 'desc' } },
        }),
      }),
    );
    expect(ticket).toEqual({
      ticketId: 'doc-ticket-1',
      ticketNumber: 'T-100',
      saleNumber: 'SALE-000001',
      createdAt: now,
      documentType: SaleDocumentType.INTERNAL_RECEIPT,
      physicalFolio: 'T-100',
      requiresAdministrativeInvoice: false,
      sellerName: 'Seller One',
      customerName: 'Restaurant Norte',
      locationId: 'loc-1',
      locationName: 'Sucursal Centro',
      items: [
        {
          productId: 'product-1',
          productName: 'Chicken breast',
          unit: ProductUnit.KG,
          quantityKg: '2.5',
          quantityPieces: 0,
          unitPrice: '100',
          subtotal: '250',
        },
      ],
      subtotal: '250',
      discount: '10',
      tax: '0',
      total: '240',
      paymentType: SalePaymentType.CASH_SALE,
      collectionStatus: CollectionStatus.PAID,
      status: SaleStatus.CONFIRMED,
      payments: [
        {
          amount: '240',
          paymentMethod: PaymentMethod.CASH,
          paidAt: now,
          saleId: 'sale-1',
          accountReceivableId: null,
        },
      ],
      legend: 'Comprobante interno sin validez fiscal',
    });
    expect(ticket).not.toHaveProperty('cfdiUuid');
    expect(ticket).not.toHaveProperty('satStatus');
    expect(ticket).not.toHaveProperty('digitalSeal');
  });

  it('lists sale documents with the internal receipt structure and blocks out-of-scope access', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({ id: 'sale-1' });
    prisma.saleDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        saleId: 'sale-1',
        documentType: SaleDocumentType.INTERNAL_RECEIPT,
        operationalLocationId: 'loc-1',
        pointOfSaleDailyCloseId: null,
        physicalFolio: 'SALE-000001',
        status: SaleDocumentStatus.ISSUED,
        requiresAdministrativeInvoice: false,
        deliveredByUserId: null,
        collectedByUserId: null,
        routeId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await service.findDocuments('sale-1', { id: 'seller-1', role: 'SELLER' });

    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sale-1', userId: 'seller-1' }, select: { id: true } }),
    );
    expect(prisma.saleDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { saleId: 'sale-1' }, orderBy: { createdAt: 'desc' } }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'doc-1',
          saleId: 'sale-1',
          documentType: SaleDocumentType.INTERNAL_RECEIPT,
          physicalFolio: 'SALE-000001',
          status: SaleDocumentStatus.ISSUED,
          requiresAdministrativeInvoice: false,
          operationalLocationId: 'loc-1',
        }),
      ],
    });
  });

  it('returns a credit internal receipt without customer or payments when they do not exist', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-2',
      saleNumber: 'SALE-000002',
      customerId: null,
      userId: 'seller-2',
      locationId: 'loc-2',
      documentType: SaleDocumentType.SIMPLE_NOTE,
      physicalFolio: null,
      requiresAdministrativeInvoice: false,
      subtotal: decimal('120'),
      discount: decimal('0'),
      tax: decimal('0'),
      total: decimal('120'),
      paymentType: SalePaymentType.CREDIT_SALE,
      collectionStatus: CollectionStatus.UNPAID,
      status: SaleStatus.CONFIRMED,
      customer: null,
      user: { id: 'seller-2', name: 'Seller Two' },
      location: { id: 'loc-2', name: 'Ruta 2' },
      documents: [],
      payments: [],
      items: [
        { id: 'item-2', productId: 'product-2', productNameSnapshot: 'Whole chicken', unit: ProductUnit.PIECE, quantityKg: decimal('0'), quantityPieces: 3, unitPrice: decimal('40'), subtotal: decimal('120') },
      ],
      createdAt: now,
    });

    const ticket = await service.getTicket('sale-2', { id: 'admin-1', role: 'ADMIN' });

    expect(ticket).toEqual(expect.objectContaining({
      ticketId: null,
      ticketNumber: 'SALE-000002',
      customerName: null,
      locationId: 'loc-2',
      locationName: 'Ruta 2',
      paymentType: SalePaymentType.CREDIT_SALE,
      payments: [],
      legend: 'Comprobante interno sin validez fiscal',
    }));
  });

  it('creates a valid paid cash sale with backend pricing, sale payment, stock decrement, and no artificial account receivable', async () => {
    const { service, prisma } = createService();
    mockHappyPath(prisma);

    const result = await service.create(validCashSale(), { id: 'seller-1', role: 'SELLER' }, 'idem-sale-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 250,
          total: 250,
          paymentType: SalePaymentType.CASH_SALE,
          status: SaleStatus.CONFIRMED,
          items: {
            create: [
              expect.objectContaining({
                productId: 'product-1',
                unit: ProductUnit.KG,
                quantityKg: 2.5,
                quantityPieces: 0,
                unitPrice: 100,
                subtotal: 250,
                productNameSnapshot: 'Chicken breast',
                quantitySnapshot: 2.5,
              }),
            ],
          },
        }),
        include: { items: true },
      }),
    );
    expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: { productId: 'product-1', locationId: 'loc-1', quantityKg: { gte: 2.5 }, quantityPieces: { gte: 0 } },
      data: { quantityKg: { decrement: 2.5 }, quantityPieces: { decrement: 0 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'product-1',
          locationId: 'loc-1',
          userId: 'seller-1',
          type: InventoryMovementType.SALE,
          quantityKg: 2.5,
          previousQuantityKg: 10,
          newQuantityKg: 7.5,
          saleId: 'sale-1',
        }),
      }),
    );
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-1',
          accountReceivableId: null,
          amount: 250,
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.APPLIED,
        }),
      }),
    );
    expect(prisma.saleDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-1',
          documentType: SaleDocumentType.INTERNAL_RECEIPT,
          operationalLocationId: 'loc-1',
          physicalFolio: 'SALE-000001',
          status: SaleDocumentStatus.ISSUED,
          requiresAdministrativeInvoice: false,
          customerSnapshot: null,
          productSnapshot: expect.objectContaining({
            items: [expect.objectContaining({ productId: 'product-1', productName: 'Chicken breast' })],
          }),
          priceSnapshot: expect.objectContaining({
            subtotal: 250,
            discount: 0,
            total: 250,
            paymentType: SalePaymentType.CASH_SALE,
            saleChannel: SaleChannel.COUNTER,
          }),
        }),
      }),
    );
    expect(prisma.accountReceivable.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        sale: expect.objectContaining({ total: '250', paymentType: SalePaymentType.CASH_SALE }),
        payment: expect.objectContaining({ amount: '250', saleId: 'sale-1', accountReceivableId: null }),
        accountReceivable: null,
        inventoryMovements: [expect.objectContaining({ saleId: 'sale-1' })],
        documents: [expect.objectContaining({ saleId: 'sale-1', documentType: SaleDocumentType.INTERNAL_RECEIPT })],
      }),
    );
  });

  it('creates a credit sale with an account receivable for the outstanding backend total', async () => {
    const { service, prisma } = createService();
    mockHappyPath(prisma);
    prisma.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      isActive: true,
      creditStatus: CreditStatus.ACTIVE,
      creditLimit: decimal('1000'),
      creditDays: 15,
      commercialPolicyId: 'policy-1',
    });

    const result = await service.create(
      validCashSale({
        customerId: 'customer-1',
        paymentType: SalePaymentType.CREDIT_SALE,
        initialPayment: {
          amount: 50,
          paymentMethod: PaymentMethod.TRANSFER,
          paidAt: now.toISOString(),
        },
      }),
      { id: 'seller-1', role: 'SELLER' },
      'idem-sale-credit',
    );

    expect(prisma.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 50 }) }));
    expect(prisma.accountReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'customer-1',
          saleId: 'sale-1',
          originalSaleId: 'sale-1',
          originalAmount: 200,
          outstandingAmount: 200,
          paymentTermsDays: 15,
          status: CollectionStatus.UNPAID,
        }),
      }),
    );
    expect(result.accountReceivable).toEqual(expect.objectContaining({ outstandingAmount: '200' }));
  });

  it('rejects an empty cart before opening a transaction', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(validCashSale({ items: [] }), { id: 'seller-1', role: 'SELLER' }, 'idem-empty'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it('rejects insufficient stock at the discount location without creating sale records', async () => {
    const { service, prisma } = createService();
    mockHappyPath(prisma);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.create(validCashSale(), { id: 'seller-1', role: 'SELLER' }, 'idem-stock'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.sale.create).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects credit sales for blocked customers or customers exceeding credit limit without administrative authorization', async () => {
    const { service, prisma } = createService();
    mockHappyPath(prisma);
    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'customer-1',
      isActive: true,
      creditStatus: CreditStatus.BLOCKED,
      creditLimit: decimal('1000'),
      creditDays: 15,
    });

    await expect(
      service.create(
        validCashSale({ customerId: 'customer-1', paymentType: SalePaymentType.CREDIT_SALE, initialPayment: undefined }),
        { id: 'seller-1', role: 'SELLER' },
        'idem-blocked',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'customer-1',
      isActive: true,
      creditStatus: CreditStatus.ACTIVE,
      creditLimit: decimal('100'),
      creditDays: 15,
    });
    prisma.accountReceivable.aggregate.mockResolvedValueOnce({ _sum: { outstandingAmount: decimal('0') } });

    await expect(
      service.create(
        validCashSale({ customerId: 'customer-1', paymentType: SalePaymentType.CREDIT_SALE, initialPayment: undefined }),
        { id: 'seller-1', role: 'SELLER' },
        'idem-limit',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });



  it('replays an idempotent sale request without creating another sale or discounting stock again', async () => {
    const { service, prisma } = createService();
    const dto = validCashSale();
    const existingSale = {
      id: 'sale-1',
      saleNumber: 'SALE-000001',
      subtotal: decimal('250'),
      discount: decimal('0'),
      tax: decimal('0'),
      total: decimal('250'),
      paymentType: SalePaymentType.CASH_SALE,
      idempotencyPayloadHash: hashPayload(dto),
      items: [],
      payments: [{ id: 'payment-1', amount: decimal('250'), saleId: 'sale-1', accountReceivableId: null }],
      accountReceivable: null,
      inventoryMovements: [],
    };
    prisma.sale.findUnique.mockResolvedValue(existingSale);

    const result = await service.create(dto, { id: 'seller-1', role: 'SELLER' }, 'idem-sale-1');

    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.sale.create).not.toHaveBeenCalled();
    expect(result.sale).toEqual(expect.objectContaining({ id: 'sale-1' }));
  });

  it('allows only ADMIN to authorize credit limit override and persists the approval reason', async () => {
    const { service, prisma } = createService();
    mockHappyPath(prisma);
    prisma.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      isActive: true,
      creditStatus: CreditStatus.ACTIVE,
      creditLimit: decimal('100'),
      creditDays: 15,
    });
    prisma.accountReceivable.aggregate.mockResolvedValue({ _sum: { outstandingAmount: decimal('0') } });

    await expect(
      service.create(
        validCashSale({
          customerId: 'customer-1',
          paymentType: SalePaymentType.CREDIT_SALE,
          initialPayment: undefined,
          administrativeOverrideReason: 'Manager approved institutional sale',
        }),
        { id: 'seller-1', role: 'SELLER' },
        'idem-seller-override',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.create(
      validCashSale({
        customerId: 'customer-1',
        paymentType: SalePaymentType.CREDIT_SALE,
        initialPayment: undefined,
        administrativeOverrideReason: 'Manager approved institutional sale',
      }),
      { id: 'admin-1', role: 'ADMIN' },
      'idem-admin-override',
    );

    expect(prisma.sale.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          administrativeOverrideReason: 'Manager approved institutional sale',
          administrativeOverrideApprovedByUserId: 'admin-1',
        }),
      }),
    );
  });

  it('allows registered cash contraentrega to create an account receivable without requiring active credit', async () => {
    const { service, prisma } = createService();
    mockHappyPath(prisma);
    prisma.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      isActive: true,
      creditStatus: CreditStatus.BLOCKED,
      creditLimit: decimal('1000'),
      creditDays: 7,
    });

    const result = await service.create(
      validCashSale({ customerId: 'customer-1', initialPayment: undefined }),
      { id: 'seller-1', role: 'SELLER' },
      'idem-contraentrega',
    );

    expect(prisma.accountReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: 'customer-1', outstandingAmount: 250 }) }),
    );
    expect(result.accountReceivable).toEqual(expect.objectContaining({ outstandingAmount: '250' }));
  });

  it('preserves captured pieces and applied unit equivalence in the sale item and inventory movement', async () => {
    const { service, prisma } = createService();
    mockHappyPath(prisma);
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Whole chicken',
      sku: 'CHK-001',
      unit: ProductUnit.KG_AND_PIECE,
      salePrice: decimal('80'),
      isActive: true,
      unitEquivalents: [
        { id: 'eq-1', factor: decimal('1.250'), roundingMode: 'HALF_UP', status: 'ACTIVE' },
      ],
    });
    prisma.inventoryBalance.findUnique.mockResolvedValue({
      productId: 'product-1',
      locationId: 'loc-1',
      quantityKg: decimal('3.750'),
      quantityPieces: 8,
    });

    await service.create(
      validCashSale({
        initialPayment: { amount: 100, paymentMethod: PaymentMethod.CASH, paidAt: now.toISOString() },
        items: [{ productId: 'product-1', unit: ProductUnit.KG_AND_PIECE, quantityKg: 1.25, quantityPieces: 2, unitEquivalentId: 'eq-1' }],
      }),
      { id: 'seller-1', role: 'SELLER' },
      'idem-eq',
    );

    expect(prisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                unit: ProductUnit.KG_AND_PIECE,
                quantityKg: 1.25,
                quantityPieces: 2,
                unitEquivalentId: 'eq-1',
                appliedEquivalentFactor: 1.25,
                roundingMode: 'HALF_UP',
              }),
            ],
          },
        }),
      }),
    );
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantityKg: 1.25,
          quantityPieces: 2,
          previousQuantityKg: 5,
          newQuantityKg: 3.75,
          previousQuantityPieces: 10,
          newQuantityPieces: 8,
        }),
      }),
    );
  });

  it('requires existing active products and locations', async () => {
    const { service, prisma } = createService();
    prisma.sale.count.mockResolvedValue(0);
    prisma.operationalLocation.findUnique.mockResolvedValue(null);

    await expect(service.create(validCashSale(), { id: 'seller-1', role: 'SELLER' }, 'idem-missing-location')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancels a confirmed sale, restores stock at the original location, and records cancel-sale movements', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-1',
      saleNumber: 'SALE-000001',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 1,
      route: null,
      collectionStatus: CollectionStatus.PAID,
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      accountReceivable: null,
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantity: decimal('2.500'),
          quantityKg: decimal('2.500'),
          quantityPieces: 0,
        },
      ],
    });
    prisma.inventoryBalance.update.mockResolvedValue({
      productId: 'product-1',
      locationId: 'loc-1',
      quantityKg: decimal('10.000'),
      quantityPieces: 5,
    });
    prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({ id: 'cancel-movement-1', createdAt: now, ...data }));
    prisma.sale.updateMany.mockResolvedValue({ count: 1 });
    prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', total: decimal('250'), discount: decimal('0'), tax: decimal('0'), subtotal: decimal('250'), version: 2, status: SaleStatus.CANCELLED, items: [] });

    const result = await service.cancel('sale-1', { reason: 'Cliente canceló pedido', expectedVersion: 1 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryBalance.update).toHaveBeenCalledWith({
      where: { productId_locationId: { productId: 'product-1', locationId: 'loc-1' } },
      data: { quantityKg: { increment: 2.5 }, quantityPieces: { increment: 0 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'product-1',
          locationId: 'loc-1',
          userId: 'admin-1',
          type: InventoryMovementType.CANCEL_SALE,
          quantityKg: 2.5,
          previousQuantityKg: 7.5,
          newQuantityKg: 10,
          saleId: 'sale-1',
          reason: 'Cliente canceló pedido',
        }),
      }),
    );
    expect(prisma.sale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-1', status: SaleStatus.CONFIRMED, version: 1 },
        data: expect.objectContaining({
          status: SaleStatus.CANCELLED,
          collectionStatus: CollectionStatus.CANCELLED,
          cancelledByUserId: 'admin-1',
          cancellationReason: 'Cliente canceló pedido',
          cancellationIdempotencyKey: 'cancel-key-1',
          version: { increment: 1 },
        }),
      }),
    );
    expect(result.sale).toEqual(expect.objectContaining({ id: 'sale-1', status: SaleStatus.CANCELLED }));
    expect(result.inventoryMovements).toEqual([expect.objectContaining({ type: InventoryMovementType.CANCEL_SALE })]);
  });

  it('cancels an unpaid credit sale and cancels its related account receivable', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-credit-1',
      saleNumber: 'SALE-000002',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 1,
      route: null,
      collectionStatus: CollectionStatus.UNPAID,
      paymentType: SalePaymentType.CREDIT_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      accountReceivable: {
        id: 'ar-1',
        originalAmount: decimal('250'),
        outstandingAmount: decimal('250'),
        status: CollectionStatus.UNPAID,
      },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantity: decimal('2.500'),
          quantityKg: decimal('2.500'),
          quantityPieces: 0,
        },
      ],
    });
    prisma.inventoryBalance.update.mockResolvedValue({
      productId: 'product-1',
      locationId: 'loc-1',
      quantityKg: decimal('10.000'),
      quantityPieces: 0,
    });
    prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({ id: 'cancel-movement-1', createdAt: now, ...data }));
    prisma.accountReceivable.update.mockImplementation(({ data }) => Promise.resolve({ id: 'ar-1', originalAmount: decimal('250'), outstandingAmount: decimal('0'), ...data }));
    prisma.sale.updateMany.mockResolvedValue({ count: 1 });
    prisma.sale.findUnique.mockResolvedValue({ id: 'sale-credit-1', total: decimal('250'), discount: decimal('0'), tax: decimal('0'), subtotal: decimal('250'), version: 2, status: SaleStatus.CANCELLED, items: [] });

    const result = await service.cancel('sale-credit-1', { reason: 'Cliente canceló crédito', expectedVersion: 1 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-credit');

    expect(prisma.accountReceivable.update).toHaveBeenCalledWith({
      where: { id: 'ar-1' },
      data: expect.objectContaining({
        outstandingAmount: 0,
        status: CollectionStatus.CANCELLED,
        cancelledAt: expect.any(Date),
      }),
    });
    expect(result.accountReceivable).toEqual(expect.objectContaining({ id: 'ar-1', status: CollectionStatus.CANCELLED }));
  });

  it('rejects double cancellation without restoring stock again', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CANCELLED,
      version: 1,
      cancellationIdempotencyKey: null,
      cancellationPayloadHash: null,
      route: null,
      items: [],
      payments: [],
      accountReceivable: null,
      pointOfSaleDailyClose: null,
    });

    await expect(
      service.cancel('sale-1', { reason: 'Cliente canceló pedido', expectedVersion: 1 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('blocks cancellation when the related account receivable already has applied collection payments', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-credit-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 3,
      paymentType: SalePaymentType.CREDIT_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      route: null,
      accountReceivable: {
        id: 'ar-1',
        originalAmount: decimal('250'),
        outstandingAmount: decimal('150'),
        status: CollectionStatus.PARTIALLY_PAID,
        payments: [{ id: 'payment-ar-1', status: PaymentStatus.APPLIED, accountReceivableId: 'ar-1' }],
      },
      items: [{ id: 'item-1', productId: 'product-1', quantityKg: decimal('2.500'), quantityPieces: 0 }],
    });

    await expect(
      service.cancel('sale-credit-1', { reason: 'Cliente canceló crédito', expectedVersion: 3 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-ar-payment'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
  });

  it('blocks cancellation when the sale already has direct applied payments', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-cash-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 2,
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: null,
      payments: [{ id: 'payment-sale-1', status: PaymentStatus.APPLIED, saleId: 'sale-cash-1', accountReceivableId: null }],
      route: null,
      accountReceivable: null,
      items: [{ id: 'item-1', productId: 'product-1', quantityKg: decimal('2.500'), quantityPieces: 0 }],
    });

    await expect(
      service.cancel('sale-cash-1', { reason: 'Cliente canceló pago aplicado', expectedVersion: 2 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-direct-payment'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
  });

  it('blocks cancellation when the sale belongs to a closed POS daily close', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-pos-closed-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 2,
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: { status: PointOfSaleDailyCloseStatus.CLOSED },
      payments: [],
      route: null,
      accountReceivable: null,
      items: [{ id: 'item-1', productId: 'product-1', quantityKg: decimal('2.500'), quantityPieces: 0 }],
    });

    await expect(
      service.cancel('sale-pos-closed-1', { reason: 'Cliente canceló cierre', expectedVersion: 2 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-pos-closed'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
  });

  it('rejects cancellation when expectedVersion does not match the current sale version', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 4,
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      route: null,
      accountReceivable: null,
      items: [{ id: 'item-1', productId: 'product-1', quantityKg: decimal('2.500'), quantityPieces: 0 }],
    });

    await expect(
      service.cancel('sale-1', { reason: 'Cliente canceló pedido', expectedVersion: 3 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-version'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
  });

  it('rejects cancellation when the sale changes between validation and persistence', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-race-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 5,
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      route: null,
      accountReceivable: null,
      items: [{ id: 'item-1', productId: 'product-1', quantityKg: decimal('2.500'), quantityPieces: 0 }],
    });
    prisma.inventoryBalance.update.mockResolvedValue({
      productId: 'product-1',
      locationId: 'loc-1',
      quantityKg: decimal('10.000'),
      quantityPieces: 0,
    });
    prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({ id: 'cancel-movement-race', createdAt: now, ...data }));
    prisma.sale.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.cancel('sale-race-1', { reason: 'Cliente canceló pedido', expectedVersion: 5 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-race'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.inventoryBalance.update).toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).toHaveBeenCalled();
    expect(prisma.sale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-race-1', status: SaleStatus.CONFIRMED, version: 5 },
      }),
    );
    expect(prisma.sale.findUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sale-race-1' } }));
  });

  it('replays an idempotent cancellation without restoring stock again', async () => {
    const { service, prisma } = createService();
    const dto = { reason: 'Cliente canceló pedido', expectedVersion: 1 };
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CANCELLED,
      version: 2,
      cancellationIdempotencyKey: 'cancel-key-replay',
      cancellationPayloadHash: hashPayload(dto),
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      route: null,
      accountReceivable: null,
      inventoryMovements: [{ id: 'movement-1', type: InventoryMovementType.CANCEL_SALE, saleId: 'sale-1' }],
      items: [],
    });

    const result = await service.cancel('sale-1', dto, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-replay');

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
    expect(result.sale).toEqual(expect.objectContaining({ id: 'sale-1', status: SaleStatus.CANCELLED }));
  });

  it('blocks cancellation for a sale on a closed route settlement', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-route-1',
      userId: 'seller-1',
      locationId: 'route-stock-1',
      status: SaleStatus.CONFIRMED,
      version: 1,
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      route: { settlement: { status: RouteSettlementStatus.CLOSED } },
      accountReceivable: null,
      items: [{ id: 'item-1', productId: 'product-1', quantityKg: decimal('2.500'), quantityPieces: 0 }],
    });

    await expect(
      service.cancel('sale-route-1', { reason: 'Cliente canceló ruta', expectedVersion: 1 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-route'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
  });

  it('rejects sale cancellation for SELLER even when the seller owns the sale', async () => {
    const { service, prisma } = createService();
    prisma.sale.findFirst.mockResolvedValue({
      id: 'sale-1',
      userId: 'seller-1',
      locationId: 'loc-1',
      status: SaleStatus.CONFIRMED,
      version: 1,
      paymentType: SalePaymentType.CASH_SALE,
      pointOfSaleDailyClose: null,
      payments: [],
      route: null,
      accountReceivable: null,
      items: [{ id: 'item-1', productId: 'product-1', quantityKg: decimal('2.500'), quantityPieces: 0 }],
    });

    await expect(
      service.cancel('sale-1', { reason: 'Cliente canceló pedido', expectedVersion: 1 }, { id: 'seller-1', role: 'SELLER' }, 'cancel-key-seller'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
  });

});
