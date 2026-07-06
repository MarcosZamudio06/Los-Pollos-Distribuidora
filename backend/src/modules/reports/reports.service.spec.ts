import { ForbiddenException } from '@nestjs/common';
import { PaymentMethod, SaleDocumentType, SalePaymentType } from '@prisma/client';
import { ReportsService } from './reports.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
const seller: AuthenticatedUser = { id: 'seller-1', email: 'seller@example.com', name: 'Seller', role: 'SELLER', mustChangePassword: false };
const warehouse: AuthenticatedUser = { id: 'warehouse-1', email: 'w@example.com', name: 'Warehouse', role: 'WAREHOUSE', mustChangePassword: false };
const driver: AuthenticatedUser = { id: 'driver-1', email: 'd@example.com', name: 'Driver', role: 'DRIVER', mustChangePassword: false };
const collectionsUser: AuthenticatedUser = { id: 'collections-1', email: 'c@example.com', name: 'Collections', role: 'COLLECTIONS', mustChangePassword: false };

function createPrismaMock() {
  return {
    sale: { findMany: jest.fn(), count: jest.fn() },
    payment: { findMany: jest.fn() },
    accountReceivable: { findMany: jest.fn(), count: jest.fn() },
    customer: { count: jest.fn() },
    billingRequest: { count: jest.fn() },
    inventoryBalance: { findMany: jest.fn() },
    deliveryOrder: { count: jest.fn() },
    routeSettlement: { findMany: jest.fn() },
  };
}

describe('ReportsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T12:00:30.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds sales-daily from confirmed sales and restricts SELLER to own sales', async () => {
    const prisma = createPrismaMock();
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1', saleNumber: 'S-1', customer: { name: 'Cliente 1' }, user: { id: 'seller-1', name: 'Vendedor 1' }, location: { id: 'loc-1', name: 'Sucursal' },
        paymentType: 'CASH_SALE', collectionStatus: 'PAID', documentType: 'SIMPLE_NOTE', physicalFolio: 'N-1', subtotal: 100, discount: 5, total: 95,
        status: 'CONFIRMED', cancellationReason: null, updatedAt: new Date('2026-07-05T12:00:00.000Z'),
        payments: [{ amount: 95, paymentMethod: 'CASH', status: 'APPLIED' }], accountReceivable: null,
      },
      {
        id: 'sale-2', saleNumber: 'S-2', customer: { name: 'Cliente 2' }, user: { id: 'seller-1', name: 'Vendedor 1' }, location: { id: 'loc-1', name: 'Sucursal' },
        paymentType: 'CREDIT_SALE', collectionStatus: 'UNPAID', documentType: 'LARGE_NOTE', physicalFolio: 'N-2', subtotal: 200, discount: 0, total: 200,
        status: 'CONFIRMED', cancellationReason: null, updatedAt: new Date('2026-07-05T11:59:50.000Z'),
        payments: [], accountReceivable: { agingStatus: 'OVERDUE' },
      },
    ]);

    const service = new ReportsService(prisma as never);
    const result = await service.getSalesDaily({ date: '2026-07-05', userId: 'other-seller' }, seller);

    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'seller-1', status: { in: ['CONFIRMED', 'CANCELLED'] } }),
    }));
    expect(result.summary).toEqual({ count: 2, subtotal: 300, discounts: 5, total: 295, cash: 95, credit: 200, cancelled: 0 });
    expect(result.byPaymentMethod).toEqual([{ paymentMethod: 'CASH', amount: 95, count: 1 }]);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ saleNumber: 'S-1', paymentMethods: ['CASH'], paymentType: 'CASH_SALE' }),
      expect.objectContaining({ saleNumber: 'S-2', paymentMethods: [], paymentType: 'CREDIT_SALE' }),
    ]));
    expect(result.agingSummary).toEqual([{ agingStatus: 'OVERDUE', count: 1, outstandingAmount: 200 }]);
    expect(result.freshnessSeconds).toBe(30);
    expect(result.isStale).toBe(false);
  });

  it('filters sales-daily by payment method using non-cancelled payments and separates cancelled notes', async () => {
    const prisma = createPrismaMock();
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-cancelled', saleNumber: 'S-C', customer: null, user: { id: 'seller-2', name: 'Vendedor 2' }, location: { id: 'loc-1', name: 'Sucursal' },
        paymentType: 'CASH_SALE', collectionStatus: 'CANCELLED', documentType: 'SIMPLE_NOTE', physicalFolio: 'N-C', subtotal: 50, discount: 0, total: 50,
        status: 'CANCELLED', cancellationReason: 'Cliente canceló', updatedAt: new Date('2026-07-05T12:00:10.000Z'), payments: [], accountReceivable: null,
      },
    ]);

    const service = new ReportsService(prisma as never);
    const result = await service.getSalesDaily({ date: '2026-07-05', paymentMethod: PaymentMethod.TRANSFER }, admin);

    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ payments: { some: { paymentMethod: 'TRANSFER', status: { not: 'CANCELLED' } } } }),
    }));
    expect(result.summary.cancelled).toBe(50);
    expect(result.canceledNotes).toEqual([{ saleNumber: 'S-C', customerName: null, reason: 'Cliente canceló', amount: 50 }]);
  });

  it('returns low stock only by operational location with pagination filters', async () => {
    const prisma = createPrismaMock();
    prisma.inventoryBalance.findMany.mockResolvedValue([
      { productId: 'p-1', locationId: 'loc-1', quantityKg: 4, quantityPieces: 0, minQuantityKg: 5, minQuantityPieces: 0, updatedAt: new Date('2026-07-05T12:00:00.000Z'), product: { name: 'Pierna', sku: 'P-1', unit: 'KG' }, location: { name: 'Sucursal' } },
      { productId: 'p-2', locationId: 'loc-1', quantityKg: 20, quantityPieces: 10, minQuantityKg: 5, minQuantityPieces: 2, updatedAt: new Date('2026-07-05T11:00:00.000Z'), product: { name: 'Pollo', sku: 'P-2', unit: 'KG_AND_PIECE' }, location: { name: 'Sucursal' } },
    ]);

    const service = new ReportsService(prisma as never);
    const result = await service.getInventoryLowStock({ locationId: 'loc-1', page: 1, limit: 10 }, warehouse);

    expect(prisma.inventoryBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { locationId: 'loc-1' },
    }));
    expect(result.items).toEqual([{ productId: 'p-1', productName: 'Pierna', sku: 'P-1', unit: 'KG', locationId: 'loc-1', locationName: 'Sucursal', quantityKg: 4, quantityPieces: 0, minQuantityKg: 5, minQuantityPieces: 0, isLowStock: true }]);
  });

  it('separates cash closing money sources and denies DRIVER financial reports', async () => {
    const prisma = createPrismaMock();
    prisma.sale.findMany.mockResolvedValue([
      { id: 'cash-sale', userId: 'seller-1', paymentType: 'CASH_SALE', total: 100, updatedAt: new Date('2026-07-05T12:00:00.000Z'), user: { id: 'seller-1', name: 'Seller' }, payments: [{ amount: 100, paymentMethod: 'CASH', bankName: null, status: 'APPLIED', routeId: null, accountReceivableId: null }] },
      { id: 'credit-sale', userId: 'seller-1', paymentType: 'CREDIT_SALE', total: 250, updatedAt: new Date('2026-07-05T11:55:00.000Z'), user: { id: 'seller-1', name: 'Seller' }, payments: [] },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      { amount: 75, paymentMethod: 'TRANSFER', bankName: 'BBVA', routeId: null, accountReceivableId: 'ar-1', userId: 'seller-1', paidAt: new Date('2026-07-05T12:00:05.000Z') },
      { amount: 25, paymentMethod: 'CASH', bankName: null, routeId: 'route-1', accountReceivableId: 'ar-2', userId: 'seller-1', paidAt: new Date('2026-07-05T12:00:10.000Z') },
    ]);

    const service = new ReportsService(prisma as never);
    const result = await service.getCashClosing({ date: '2026-07-05', userId: 'other-seller' }, seller);

    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'seller-1' }) }));
    expect(result.cashSales).toEqual([{ paymentMethod: 'CASH', amount: 100, count: 1 }]);
    expect(result.creditSales).toEqual({ amount: 250, count: 1 });
    expect(result.accountsReceivablePayments).toEqual([{ paymentMethod: 'TRANSFER', amount: 75, count: 1 }]);
    expect(result.routeCollections).toEqual([{ paymentMethod: 'CASH', amount: 25, count: 1 }]);
    expect(result.paymentsByBank).toEqual([{ bankName: 'BBVA', amount: 75, count: 1 }]);
    await expect(service.getCashClosing({ date: '2026-07-05' }, driver)).rejects.toBeInstanceOf(ForbiddenException);
  });


  it('filters low-stock records before paginating so later low-stock items are not skipped', async () => {
    const prisma = createPrismaMock();
    prisma.inventoryBalance.findMany.mockResolvedValue([
      { productId: 'ok-1', locationId: 'loc-1', quantityKg: 20, quantityPieces: 0, minQuantityKg: 5, minQuantityPieces: 0, updatedAt: new Date('2026-07-05T12:00:00.000Z'), product: { name: 'Con stock', sku: 'OK-1', unit: 'KG' }, location: { name: 'Sucursal' } },
      { productId: 'low-1', locationId: 'loc-1', quantityKg: 3, quantityPieces: 0, minQuantityKg: 5, minQuantityPieces: 0, updatedAt: new Date('2026-07-05T12:00:01.000Z'), product: { name: 'Bajo 1', sku: 'L-1', unit: 'KG' }, location: { name: 'Sucursal' } },
      { productId: 'low-2', locationId: 'loc-1', quantityKg: 2, quantityPieces: 0, minQuantityKg: 5, minQuantityPieces: 0, updatedAt: new Date('2026-07-05T12:00:02.000Z'), product: { name: 'Bajo 2', sku: 'L-2', unit: 'KG' }, location: { name: 'Sucursal' } },
    ]);

    const service = new ReportsService(prisma as never);
    const result = await service.getInventoryLowStock({ page: 2, limit: 1 }, warehouse);

    expect(prisma.inventoryBalance.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ skip: expect.any(Number), take: expect.any(Number) }));
    expect(result.items).toEqual([
      expect.objectContaining({ productId: 'low-2', isLowStock: true }),
    ]);
  });

  it('limits COLLECTIONS dashboard payment totals to receivable or route collections only', async () => {
    const prisma = createPrismaMock();
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([
      { amount: 100, paymentMethod: 'CASH', bankName: null, routeId: null, accountReceivableId: null, paidAt: new Date('2026-07-05T12:00:00.000Z') },
      { amount: 40, paymentMethod: 'TRANSFER', bankName: 'BBVA', routeId: null, accountReceivableId: 'ar-1', paidAt: new Date('2026-07-05T12:00:05.000Z') },
      { amount: 25, paymentMethod: 'CASH', bankName: null, routeId: 'route-1', accountReceivableId: 'ar-2', paidAt: new Date('2026-07-05T12:00:10.000Z') },
    ]);
    prisma.accountReceivable.findMany.mockResolvedValue([]);
    prisma.accountReceivable.count.mockResolvedValue(0);
    prisma.customer.count.mockResolvedValue(0);
    prisma.billingRequest.count.mockResolvedValue(0);
    prisma.inventoryBalance.findMany.mockResolvedValue([]);
    prisma.deliveryOrder.count.mockResolvedValue(0);
    prisma.routeSettlement.findMany.mockResolvedValue([]);

    const service = new ReportsService(prisma as never);
    const result = await service.getDashboard({ date: '2026-07-05' }, collectionsUser);

    expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ accountReceivableId: { not: null } }, { routeId: { not: null } }] }),
    }));
    expect(result.paymentsByMethodToday).toEqual([
      { paymentMethod: 'TRANSFER', amount: 40, count: 1 },
      { paymentMethod: 'CASH', amount: 25, count: 1 },
    ]);
    expect(result.collectionsToday).toBe(65);
  });

  it('keeps seller summary accounts receivable payments separate from route collections', async () => {
    const prisma = createPrismaMock();
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([
      { amount: 75, paymentMethod: 'TRANSFER', bankName: 'BBVA', routeId: null, accountReceivableId: 'ar-1', userId: 'seller-1', paidAt: new Date('2026-07-05T12:00:05.000Z') },
      { amount: 25, paymentMethod: 'CASH', bankName: null, routeId: 'route-1', accountReceivableId: 'ar-2', userId: 'seller-1', paidAt: new Date('2026-07-05T12:00:10.000Z') },
    ]);

    const service = new ReportsService(prisma as never);
    const result = await service.getCashClosing({ date: '2026-07-05' }, seller);

    expect(result.sellerSummary).toEqual([{ sellerId: 'seller-1', sellerName: null, cashSales: 0, creditSales: 0, collections: 75, routeCollections: 25 }]);
  });

  it('limits dashboard metrics by role and includes freshness metadata', async () => {
    const prisma = createPrismaMock();
    prisma.sale.findMany.mockResolvedValue([{ id: 'sale-1', total: 100, paymentType: 'CASH_SALE', updatedAt: new Date('2026-07-05T12:00:00.000Z'), payments: [{ amount: 100, paymentMethod: 'CASH', status: 'APPLIED' }] }]);
    prisma.payment.findMany.mockResolvedValue([{ amount: 40, paymentMethod: 'CASH', bankName: null, routeId: 'route-1', paidAt: new Date('2026-07-05T12:00:05.000Z') }]);
    prisma.accountReceivable.findMany.mockResolvedValue([{ outstandingAmount: 60, updatedAt: new Date('2026-07-05T11:59:00.000Z') }]);
    prisma.accountReceivable.count.mockResolvedValue(1);
    prisma.customer.count.mockResolvedValue(2);
    prisma.billingRequest.count.mockResolvedValue(3);
    prisma.inventoryBalance.findMany.mockResolvedValue([{ productId: 'p-1', locationId: 'loc-1', quantityKg: 1, quantityPieces: 0, minQuantityKg: 5, minQuantityPieces: 0, updatedAt: new Date('2026-07-05T12:00:15.000Z'), product: { name: 'Pierna', sku: 'P-1', unit: 'KG' }, location: { name: 'Sucursal' } }]);
    prisma.deliveryOrder.count.mockResolvedValue(0);
    prisma.routeSettlement.findMany.mockResolvedValue([{ expectedCashAmount: 100, expectedTransferAmount: 0, paidAtDeliveryAmount: 20, secondPassCollectionsAmount: 10, updatedAt: new Date('2026-07-05T12:00:20.000Z') }]);

    const service = new ReportsService(prisma as never);
    const sellerDashboard = await service.getDashboard({ date: '2026-07-05' }, seller);
    const driverDashboard = await service.getDashboard({ date: '2026-07-05' }, driver);

    expect(sellerDashboard.salesToday).toEqual({ total: 100, count: 1, cash: 100, credit: 0 });
    expect(sellerDashboard.lowStockByLocation).toEqual([]);
    expect(driverDashboard.salesToday).toEqual({ total: 0, count: 0, cash: 0, credit: 0 });
    expect(driverDashboard.routeCollectionsPendingSettlement).toBe(0);
    expect(driverDashboard.freshnessSeconds).toBe(0);
  });

  it('scopes DRIVER dashboard delivery counts to assigned route instead of delivered orders only', async () => {
    const prisma = createPrismaMock();
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.accountReceivable.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);
    prisma.billingRequest.count.mockResolvedValue(0);
    prisma.inventoryBalance.findMany.mockResolvedValue([]);
    prisma.deliveryOrder.count.mockResolvedValue(0);
    prisma.routeSettlement.findMany.mockResolvedValue([]);

    const service = new ReportsService(prisma as never);
    await service.getDashboard({ date: '2026-07-05' }, driver);

    expect(prisma.deliveryOrder.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ route: { driverId: 'driver-1' } }),
    }));
  });
});
