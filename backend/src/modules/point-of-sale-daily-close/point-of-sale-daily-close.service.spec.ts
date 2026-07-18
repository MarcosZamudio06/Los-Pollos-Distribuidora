import { BadRequestException, ConflictException } from '@nestjs/common';
import { PointOfSaleDailyCloseService } from './point-of-sale-daily-close.service';

describe('PointOfSaleDailyCloseService', () => {
  const prisma = {
    operationalLocation: { findUnique: jest.fn() },
    pointOfSaleDailyClose: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
  const service = new PointOfSaleDailyCloseService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects opening an inactive location', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: false });
    await expect(service.open({ operationalLocationId: 'loc-1', businessDate: '2026-07-17' }, { id: 'u1' } as never))
      .rejects.toThrow(new BadRequestException('LOCATION_INACTIVE'));
  });

  it('rejects a duplicate non-cancelled close', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: true });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({ id: 'close-1' });
    await expect(service.open({ operationalLocationId: 'loc-1', businessDate: '2026-07-17' }, { id: 'u1' } as never))
      .rejects.toThrow(new ConflictException('DAILY_CLOSE_ALREADY_EXISTS'));
  });

  it('syncs confirmed branch sales even when they are assigned to a route', async () => {
    const tx = {
      sale: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      inventoryMovement: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    await (service as any).syncOperations(
      tx,
      'close-1',
      'loc-1',
      new Date('2026-07-17T06:00:00.000Z'),
      new Date('2026-07-18T06:00:00.000Z'),
    );

    expect(tx.sale.updateMany).toHaveBeenCalledWith({
      where: {
        locationId: 'loc-1',
        createdAt: { gte: new Date('2026-07-17T06:00:00.000Z'), lt: new Date('2026-07-18T06:00:00.000Z') },
        status: 'CONFIRMED',
      },
      data: { pointOfSaleDailyCloseId: 'close-1' },
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ routeId: null }),
    }));
  });

  it('uses America/Mexico_City boundaries for the operational day', () => {
    expect((service as any).operationalDay(new Date('2026-07-17T00:00:00.000Z'))).toEqual({
      from: new Date('2026-07-17T06:00:00.000Z'),
      to: new Date('2026-07-18T06:00:00.000Z'),
    });
  });
});
