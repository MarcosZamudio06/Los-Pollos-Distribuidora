import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CashManagementService } from './cash-management.service';

function createPrisma() {
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    $executeRawUnsafe: jest.fn(),
    cashTerminal: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    cashShift: { aggregate: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    cashMovement: { aggregate: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    payment: { aggregate: jest.fn() },
    pointOfSaleDailyClose: { create: jest.fn(), findFirst: jest.fn() },
  };
  return prisma;
}

const admin = { id: 'admin-1', role: 'ADMIN', operationalLocationId: 'loc-1' } as never;
const cashier = { id: 'cashier-1', role: 'SELLER', operationalLocationId: 'loc-1' } as never;

describe('CashManagementService', () => {
  it('registers a managed terminal with a unique device identity', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.create.mockResolvedValue({ id: 'terminal-1', code: 'C01', deviceId: 'device-1' });
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await expect(service.createTerminal({ operationalLocationId: 'loc-1', code: 'C01', name: 'Caja 01', deviceId: 'device-1' }, admin))
      .resolves.toMatchObject({ id: 'terminal-1', deviceId: 'device-1' });
    expect(prisma.cashTerminal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operationalLocationId: 'loc-1', code: 'C01', deviceId: 'device-1' }) });
  });

  it('opens independent shifts for terminals under the same branch daily close', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({ id: 'terminal-2', operationalLocationId: 'loc-1', deviceId: 'device-2', isActive: true, operationalLocation: { isActive: true, type: 'BRANCH' } });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({ id: 'close-1', status: 'DRAFT' });
    prisma.cashShift.create.mockResolvedValue({ id: 'shift-2', terminalId: 'terminal-2', pointOfSaleDailyCloseId: 'close-1', cashierUserId: 'cashier-1', status: 'OPEN' });
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await service.openShift({ terminalId: 'terminal-2', deviceId: 'device-2', businessDate: '2026-07-27', initialCashFund: 500 }, cashier);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close:loc-1:2026-07-27',
    );
    expect(prisma.cashShift.create).toHaveBeenCalledWith({ data: expect.objectContaining({ terminalId: 'terminal-2', pointOfSaleDailyCloseId: 'close-1', cashierUserId: 'cashier-1' }), include: expect.any(Object) });
    expect(prisma.pointOfSaleDailyClose.create).not.toHaveBeenCalled();
  });

  it('rejects opening a shift from a device not registered to the terminal', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({ id: 'terminal-1', operationalLocationId: 'loc-1', deviceId: 'device-1', isActive: true, operationalLocation: { isActive: true, type: 'BRANCH' } });
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await expect(service.openShift({ terminalId: 'terminal-1', deviceId: 'other-device', businessDate: '2026-07-27' }, cashier))
      .rejects.toThrow(new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH'));
  });

  it('translates concurrent open-shift uniqueness into a domain conflict', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({ id: 'terminal-1', operationalLocationId: 'loc-1', deviceId: 'device-1', isActive: true, operationalLocation: { isActive: true, type: 'BRANCH' } });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({ id: 'close-1', status: 'DRAFT' });
    prisma.cashShift.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }));
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await expect(service.openShift({ terminalId: 'terminal-1', deviceId: 'device-1', businessDate: '2026-07-27' }, cashier))
      .rejects.toThrow(new ConflictException('CASH_SHIFT_ALREADY_OPEN'));
  });

  it('does not expose another cashier open shift as current', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findFirst.mockResolvedValue(null);
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await service.currentShift('device-1', cashier);

    expect(prisma.cashShift.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ cashierUserId: 'cashier-1', status: 'OPEN', terminal: { deviceId: 'device-1', isActive: true } }) }));
  });

  it('prevents sellers from registering terminals', async () => {
    const service = new CashManagementService(createPrisma() as unknown as PrismaService);
    await expect(service.createTerminal({ operationalLocationId: 'loc-1', code: 'C01', name: 'Caja 01', deviceId: 'device-1' }, cashier))
      .rejects.toThrow(ForbiddenException);
  });

  it('allows an admin to bind a migrated terminal to the registered device', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({ id: 'legacy-terminal-1' });
    prisma.cashTerminal.update.mockResolvedValue({ id: 'legacy-terminal-1', deviceId: 'device-real' });
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await expect(service.updateTerminal('legacy-terminal-1', { deviceId: 'device-real' }, admin))
      .resolves.toMatchObject({ deviceId: 'device-real' });
  });

  it('only lists the terminal registered to a seller device', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findMany.mockResolvedValue([]);
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await service.listTerminals({ operationalLocationId: 'loc-1', deviceId: 'device-1', isActive: true }, cashier);

    expect(prisma.cashTerminal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { operationalLocationId: 'loc-1', deviceId: 'device-1', isActive: true },
    }));
    await expect(service.listTerminals({ operationalLocationId: 'loc-1' }, cashier))
      .rejects.toThrow(new BadRequestException('CASH_TERMINAL_DEVICE_REQUIRED'));
  });

  it('rejects opening a shift when the consolidated close is no longer editable', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({ id: 'terminal-1', operationalLocationId: 'loc-1', deviceId: 'device-1', isActive: true, operationalLocation: { isActive: true, type: 'BRANCH' } });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({ id: 'close-1', status: 'CLOSED' });
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await expect(service.openShift({ terminalId: 'terminal-1', deviceId: 'device-1', businessDate: '2026-07-27' }, cashier))
      .rejects.toThrow(new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'));
    expect(prisma.cashShift.create).not.toHaveBeenCalled();
  });

  it('counts opening deposits and withdrawals only once when closing a shift', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1', status: 'OPEN', cashierUserId: 'cashier-1', initialCashFund: 100,
      initialCashIn: 20, initialCashOut: 10, terminal: { deviceId: 'device-1' },
    });
    prisma.cashShift.updateMany.mockResolvedValue({ count: 1 });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    prisma.cashMovement.aggregate.mockImplementation(({ where }: { where: { type: string } }) => {
      const amounts: Record<string, number> = { CASH_IN: 5, CASH_OUT: 3, EXPENSE: 2 };
      return Promise.resolve({ _sum: { amount: amounts[where.type] } });
    });
    prisma.cashShift.update.mockResolvedValue({ id: 'shift-1', status: 'CLOSED' });
    const service = new CashManagementService(prisma as unknown as PrismaService);

    await service.closeShift('shift-1', { deviceId: 'device-1', cashCountedTotal: 165 }, cashier);

    expect(prisma.cashMovement.aggregate).toHaveBeenCalledWith({ where: { cashShiftId: 'shift-1', type: 'CASH_IN', isOpening: false }, _sum: { amount: true } });
    expect(prisma.cashMovement.aggregate).toHaveBeenCalledWith({ where: { cashShiftId: 'shift-1', type: 'CASH_OUT', isOpening: false }, _sum: { amount: true } });
    expect(prisma.cashShift.update).toHaveBeenCalledWith(expect.objectContaining({ data: { cashCountedTotal: 165, cashDifferenceTotal: 5 } }));
  });

  it('replays an idempotent movement without creating a duplicate', async () => {
    const prisma = createPrisma();
    const shift = { id: 'shift-1', status: 'OPEN', cashierUserId: 'cashier-1', operationalLocationId: 'loc-1', pointOfSaleDailyCloseId: 'close-1', terminal: { deviceId: 'device-1' } };
    prisma.cashShift.findUnique.mockResolvedValue(shift);
    prisma.cashMovement.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'movement-1', ...data }));
    const service = new CashManagementService(prisma as unknown as PrismaService);
    const dto = { deviceId: 'device-1', type: 'EXPENSE' as const, amount: 25, reason: 'Hielo' };

    const created = await service.recordMovement('shift-1', dto, cashier, 'movement-key');
    prisma.cashMovement.findUnique.mockResolvedValue(created);
    const replayed = await service.recordMovement('shift-1', dto, cashier, 'movement-key');

    expect(replayed).toMatchObject({ id: 'movement-1' });
    expect(prisma.cashMovement.create).toHaveBeenCalledTimes(1);
  });
});
