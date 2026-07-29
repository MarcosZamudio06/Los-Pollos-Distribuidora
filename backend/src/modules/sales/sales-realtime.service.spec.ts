import { Prisma } from '@prisma/client';
import { SalesRealtimeService } from './sales-realtime.service';

describe('SalesRealtimeService', () => {
  it('projects only persisted confirmed-sale data before broadcasting', async () => {
    const prisma = {
      sale: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'SALE-000001',
          createdAt: new Date('2026-07-27T10:00:00.000Z'),
          total: new Prisma.Decimal('250.00'),
          status: 'CONFIRMED',
          customer: { id: 'customer-1', name: 'Comercial Norte' },
          location: { id: 'loc-1', name: 'Sucursal Centro' },
          items: [
            {
              id: 'item-1',
              productId: 'product-1',
              productNameSnapshot: 'Pechuga',
              unit: 'KG',
              quantityKg: new Prisma.Decimal('2.5'),
              quantityPieces: 0,
            },
          ],
        }),
      },
    };
    const salesGateway = { emitSaleCreated: jest.fn() };
    const service = new SalesRealtimeService(
      prisma as never,
      salesGateway as never,
    );

    await service.publishCreated('sale-1');

    expect(salesGateway.emitSaleCreated).toHaveBeenCalledWith({
      id: 'sale-1',
      saleNumber: 'SALE-000001',
      createdAt: '2026-07-27T10:00:00.000Z',
      total: '250',
      status: 'CONFIRMED',
      customer: { id: 'customer-1', name: 'Comercial Norte' },
      location: { id: 'loc-1', name: 'Sucursal Centro' },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          productName: 'Pechuga',
          unit: 'KG',
          quantityKg: '2.5',
          quantityPieces: 0,
        },
      ],
    });
  });

  it('does not broadcast an unconfirmed sale', async () => {
    const prisma = {
      sale: { findUnique: jest.fn().mockResolvedValue({ status: 'DRAFT' }) },
    };
    const salesGateway = { emitSaleCreated: jest.fn() };
    const service = new SalesRealtimeService(
      prisma as never,
      salesGateway as never,
    );

    await service.publishCreated('sale-1');

    expect(salesGateway.emitSaleCreated).not.toHaveBeenCalled();
  });
});
