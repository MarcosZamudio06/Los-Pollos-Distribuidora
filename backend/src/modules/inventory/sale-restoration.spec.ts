import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import {
  acquireSaleLifecycleLock,
  assertSaleExecutable,
} from './sale-restoration';

describe('sale lifecycle conflict policy', () => {
  const raw = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('raw query failed', {
      code: 'P2010',
      clientVersion: Prisma.prismaVersion.client,
      meta: { code },
    });
  const txFor = (error?: unknown) => ({
    $executeRaw: error
      ? jest.fn().mockRejectedValue(error)
      : jest.fn().mockResolvedValue(1),
    sale: {
      findUnique: jest.fn().mockResolvedValue({ status: SaleStatus.CONFIRMED }),
    },
  });

  it.each(['40001', '40P01'])(
    'preserves the legacy HTTP contract for every default consumer (%s)',
    async (code) => {
      const tx = txFor(raw(code));
      for (const operation of [
        acquireSaleLifecycleLock,
        assertSaleExecutable,
      ]) {
        await expect(operation(tx as never, 'sale')).rejects.toThrow(
          'Sale lifecycle changed; retry with the same Idempotency-Key',
        );
      }
      expect(tx.sale.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['40001', '40P01'])(
    'exposes only exact raw transient errors to an opted-in transaction owner (%s)',
    async (code) => {
      const tx = txFor(raw(code));
      await expect(
        assertSaleExecutable(tx as never, 'sale', {
          retryTransientConflicts: true,
        }),
      ).rejects.toMatchObject({
        code: 'P2034',
        meta: { code },
        clientVersion: Prisma.prismaVersion.client,
      });
      expect(tx.sale.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['23505', '42501', '55P03', '08006', '40001x'])(
    'preserves non-transient SQLSTATE %s unchanged',
    async (code) => {
      const error = raw(code);
      await expect(
        acquireSaleLifecycleLock(txFor(error) as never, 'sale', {
          retryTransientConflicts: true,
        }),
      ).rejects.toBe(error);
    },
  );

  it.each([
    new Error('network outcome unknown'),
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2025' },
  ])(
    'does not promote unverified errors %p into a transaction retry',
    async (error) => {
      await expect(
        acquireSaleLifecycleLock(txFor(error) as never, 'sale', {
          retryTransientConflicts: true,
        }),
      ).rejects.toBe(error);
    },
  );

  it('preserves row-not-found and real sale-state conflicts', async () => {
    const tx = txFor();
    tx.$executeRaw.mockResolvedValueOnce(0);
    await expect(
      acquireSaleLifecycleLock(tx as never, 'missing', {
        retryTransientConflicts: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.sale.findUnique.mockResolvedValue({ status: SaleStatus.CANCELLED });
    await expect(
      assertSaleExecutable(tx as never, 'sale', {
        retryTransientConflicts: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.sale.findUnique.mockResolvedValue({ status: SaleStatus.CONFIRMED });
    await expect(
      assertSaleExecutable(tx as never, 'sale', {
        retryTransientConflicts: true,
      }),
    ).resolves.toBeUndefined();
  });
});
