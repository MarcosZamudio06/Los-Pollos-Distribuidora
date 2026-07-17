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
});
