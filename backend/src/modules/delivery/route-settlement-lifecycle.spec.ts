import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  acquireRouteLifecycleLock,
  assertRouteSettlementMutable,
} from './route-settlement-lifecycle';

describe('route settlement lifecycle lock', () => {
  it('normalizes raw PostgreSQL serialization conflicts into the bounded retry signal', async () => {
    const raw = new Prisma.PrismaClientKnownRequestError('serialization', {
      code: 'P2010',
      clientVersion: Prisma.prismaVersion.client,
      meta: { code: '40001' },
    });
    const tx = { $executeRaw: jest.fn().mockRejectedValue(raw) };
    await expect(
      acquireRouteLifecycleLock(tx as never, 'route'),
    ).rejects.toMatchObject({ code: 'P2034' });
  });
  it('does not swallow unrelated database errors', async () => {
    const error = new Error('unavailable');
    await expect(
      acquireRouteLifecycleLock(
        { $executeRaw: jest.fn().mockRejectedValue(error) } as never,
        'route',
      ),
    ).rejects.toBe(error);
  });
  it('fails closed when the target row does not exist', async () => {
    await expect(
      acquireRouteLifecycleLock(
        { $executeRaw: jest.fn().mockResolvedValue(0) } as never,
        'missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects closed settlements and mismatched route references', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      routeSettlement: {
        findUnique: jest.fn().mockResolvedValue({ id: 's', status: 'CLOSED' }),
      },
    };
    await expect(
      assertRouteSettlementMutable(tx as never, 'route'),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.routeSettlement.findUnique.mockResolvedValue({
      id: 's',
      status: 'OPEN',
    });
    await expect(
      assertRouteSettlementMutable(tx as never, 'route', 'foreign'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
