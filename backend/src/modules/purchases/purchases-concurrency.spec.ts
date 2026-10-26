import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ProductUnit } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../../database/prisma.service';
import { InventoryBalanceService } from '../inventory/inventory-balance.service';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('PurchasesService bounded transaction recovery (FUNC-009)', () => {
  const user: AuthenticatedUser = {
    id: 'admin',
    name: 'Admin',
    email: 'audit@example.test',
    role: 'ADMIN',
    mustChangePassword: false,
  };
  const body = {
    supplierId: 'supplier',
    locationId: 'cedis',
    items: [
      {
        productId: 'product',
        unit: ProductUnit.PIECE,
        quantityPieces: 10,
        quantityKg: 0,
        unitCost: 5,
      },
    ],
  };
  const conflict = Object.assign(new Error('serialization conflict'), {
    code: 'P2034',
  });
  const setup = () => {
    const transaction = jest.fn();
    const service = new PurchasesService(
      { $transaction: transaction } as unknown as PrismaService,
      new InventoryBalanceService(),
    );
    return { service, transaction };
  };
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('restarts the whole Serializable transaction after P2034, not only the failed statement', async () => {
    jest.useFakeTimers();
    const { service, transaction } = setup();
    transaction
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce('committed');
    const promise = service.create(body, user, 'same-command');
    const assertion = expect(promise).resolves.toBe('committed');
    await jest.runAllTimersAsync();
    await assertion;
    expect(transaction).toHaveBeenCalledTimes(2);
    for (const call of transaction.mock.calls as unknown[][])
      expect(call[1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('re-reads an idempotent purchase after a purchaseNumber unique race', async () => {
    jest.useFakeTimers();
    const { service, transaction } = setup();
    transaction
      .mockRejectedValueOnce(
        Object.assign(new Error('unique'), {
          code: 'P2002',
          meta: { target: ['purchaseNumber'] },
        }),
      )
      .mockResolvedValueOnce('replayed');
    const assertion = expect(
      service.create(body, user, 'same-command'),
    ).resolves.toBe('replayed');
    await jest.runAllTimersAsync();
    await assertion;
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('stops after five complete attempts with a controlled concurrency error', async () => {
    jest.useFakeTimers();
    const { service, transaction } = setup();
    transaction.mockRejectedValue(conflict);
    const timer = jest.spyOn(global, 'setTimeout');
    const assertion = expect(
      service.create(body, user, 'same-command'),
    ).rejects.toMatchObject({
      response: { code: 'PURCHASE_CONCURRENCY_RETRY_EXHAUSTED' },
    });
    await jest.runAllTimersAsync();
    await assertion;
    expect(transaction).toHaveBeenCalledTimes(5);
    expect(timer).toHaveBeenCalledTimes(4);
    for (const call of timer.mock.calls) {
      expect(Number(call[1])).toBeGreaterThanOrEqual(20);
      expect(Number(call[1])).toBeLessThanOrEqual(220);
    }
  });

  it.each([
    new BadRequestException('invalid product'),
    new ForbiddenException('wrong location'),
    new ConflictException('payload mismatch'),
    Object.assign(new Error('unrelated uniqueness'), {
      code: 'P2002',
      meta: { target: ['otherField'] },
    }),
    Object.assign(new Error('connection failure'), { code: 'P1001' }),
    Object.assign(new Error('nonrecoverable transaction error'), {
      code: 'P2028',
    }),
  ])('does not retry or reclassify nonrecoverable error %#', async (error) => {
    const { service, transaction } = setup();
    transaction.mockRejectedValue(error);
    await expect(service.create(body, user, 'same-command')).rejects.toBe(
      error,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
