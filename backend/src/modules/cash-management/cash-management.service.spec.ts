import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
import { CashManagementService } from './cash-management.service';

function createPrisma() {
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback(prisma)),
    ),
    $executeRawUnsafe: jest.fn(),
    cashTerminal: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    cashTerminalActivation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    cashShift: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cashMovement: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    payment: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    pointOfSaleDailyClose: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ status: 'DRAFT' }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    sale: { findMany: jest.fn(), updateMany: jest.fn() },
    inventoryMovement: { findMany: jest.fn(), updateMany: jest.fn() },
    dailyCloseInventoryCount: { findMany: jest.fn() },
    dailyCloseDifference: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    dailyCloseEvent: { create: jest.fn() },
    operationalLocation: { findUnique: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'cashier-1',
        isActive: true,
        operationalLocationId: 'loc-1',
      }),
    },
  };
  return prisma;
}

function createService(prisma = createPrisma()) {
  const dailyCloseService = {
    recalculateAfterDraftMutation: jest.fn().mockResolvedValue(undefined),
  };
  const authService = {
    verifyPassword: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new CashManagementService(
      prisma as unknown as PrismaService,
      dailyCloseService as never,
      authService as unknown as AuthService,
    ),
    dailyCloseService,
    authService,
  };
}

const admin = {
  id: 'admin-1',
  role: 'ADMIN',
  permissions: [
    PERMISSIONS.CASH_TERMINALS_REASSIGN,
    PERMISSIONS.CASH_SHIFTS_ADMINISTRATIVE_CLOSE,
    PERMISSIONS.CASH_SHIFT_OPEN_OWN,
    PERMISSIONS.CASH_SHIFT_CLOSE_OWN,
  ],
  operationalLocationId: 'loc-1',
} as never;
const cashier = {
  id: 'cashier-1',
  role: 'SELLER',
  permissions: [
    PERMISSIONS.CASH_SHIFT_OPEN_OWN,
    PERMISSIONS.CASH_SHIFT_CLOSE_OWN,
  ],
  operationalLocationId: 'loc-1',
} as never;
const collectionCashier = {
  id: 'collector-1',
  role: 'COLLECTIONS',
  permissions: [
    PERMISSIONS.COLLECTIONS_RECEIVE_CASH,
    PERMISSIONS.CASH_SHIFT_OPEN_OWN,
    PERMISSIONS.CASH_SHIFT_CLOSE_OWN,
  ],
  operationalLocationId: 'loc-1',
} as never;

describe('CashManagementService', () => {
  it('registers a managed terminal with a unique device identity', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.create.mockResolvedValue({
      id: 'terminal-1',
      code: 'C01',
      deviceId: 'device-1',
    });
    const { service } = createService(prisma);

    await expect(
      service.createTerminal(
        {
          operationalLocationId: 'loc-1',
          code: 'C01',
          name: 'Caja 01',
          deviceId: 'device-1',
        },
        admin,
      ),
    ).resolves.toMatchObject({ id: 'terminal-1', deviceId: 'device-1' });
    expect(prisma.cashTerminal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operationalLocationId: 'loc-1',
        code: 'C01',
        deviceId: 'device-1',
      }),
    });
  });

  it('rejects terminal changes without the terminal reassignment permission', async () => {
    const prisma = createPrisma();
    const { service } = createService(prisma);

    await expect(
      service.createTerminal(
        {
          operationalLocationId: 'loc-1',
          code: 'C01',
          name: 'Caja 01',
          deviceId: 'device-1',
        },
        { ...admin, permissions: [] },
      ),
    ).rejects.toThrow('CASH_TERMINAL_PERMISSION_REQUIRED');
    expect(prisma.cashTerminal.create).not.toHaveBeenCalled();
  });

  it('opens independent shifts for terminals under the same branch daily close', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'terminal-2',
      operationalLocationId: 'loc-1',
      deviceId: 'device-2',
      isActive: true,
      operationalLocation: { isActive: true, type: 'BRANCH' },
    });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({
      id: 'close-1',
      status: 'DRAFT',
    });
    prisma.cashShift.create.mockResolvedValue({
      id: 'shift-2',
      terminalId: 'terminal-2',
      pointOfSaleDailyCloseId: 'close-1',
      cashierUserId: 'collector-1',
      status: 'OPEN',
    });
    const { service, dailyCloseService } = createService(prisma);

    await service.openShift(
      {
        terminalId: 'terminal-2',
        deviceId: 'device-2',
        businessDate: '2026-07-27',
        initialCashFund: 500,
      },
      collectionCashier,
    );

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close:loc-1:2026-07-27',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
    expect(prisma.cashShift.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        terminalId: 'terminal-2',
        pointOfSaleDailyCloseId: 'close-1',
        cashierUserId: 'collector-1',
      }),
      include: expect.any(Object),
    });
    expect(prisma.pointOfSaleDailyClose.create).not.toHaveBeenCalled();
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledWith('close-1', prisma);
  });

  it('rejects opening a shift without the own-shift permission', async () => {
    const prisma = createPrisma();
    const { service } = createService(prisma);

    await expect(
      service.openShift(
        {
          terminalId: 'terminal-1',
          deviceId: 'device-1',
          businessDate: '2026-07-27',
        },
        {
          ...collectionCashier,
          permissions: [PERMISSIONS.COLLECTIONS_RECEIVE_CASH],
        },
      ),
    ).rejects.toThrow(
      new ForbiddenException('CASH_SHIFT_OPEN_PERMISSION_REQUIRED'),
    );

    expect(prisma.cashTerminal.findUnique).not.toHaveBeenCalled();
  });

  it('rejects opening a shift from a device not registered to the terminal', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-1',
      isActive: true,
      operationalLocation: { isActive: true, type: 'BRANCH' },
    });
    const { service } = createService(prisma);

    await expect(
      service.openShift(
        {
          terminalId: 'terminal-1',
          deviceId: 'other-device',
          businessDate: '2026-07-27',
        },
        cashier,
      ),
    ).rejects.toThrow(new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH'));
  });

  it('translates concurrent open-shift uniqueness into a domain conflict', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-1',
      isActive: true,
      operationalLocation: { isActive: true, type: 'BRANCH' },
    });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({
      id: 'close-1',
      status: 'DRAFT',
    });
    prisma.cashShift.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    const { service } = createService(prisma);

    await expect(
      service.openShift(
        {
          terminalId: 'terminal-1',
          deviceId: 'device-1',
          businessDate: '2026-07-27',
        },
        cashier,
      ),
    ).rejects.toThrow(new ConflictException('CASH_SHIFT_ALREADY_OPEN'));
  });

  it('does not expose another cashier open shift as current', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findFirst.mockResolvedValue(null);
    const { service } = createService(prisma);

    await service.currentShift('device-1', cashier);

    expect(prisma.cashShift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cashierUserId: 'cashier-1',
          status: 'OPEN',
          terminal: { deviceId: 'device-1', isActive: true },
        }),
      }),
    );
  });

  it('prevents sellers from registering terminals', async () => {
    const { service } = createService();
    await expect(
      service.createTerminal(
        {
          operationalLocationId: 'loc-1',
          code: 'C01',
          name: 'Caja 01',
          deviceId: 'device-1',
        },
        cashier,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an admin to bind a migrated terminal to the registered device', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'legacy-terminal-1',
    });
    prisma.cashTerminal.update.mockResolvedValue({
      id: 'legacy-terminal-1',
      deviceId: 'device-real',
    });
    const { service } = createService(prisma);

    await expect(
      service.updateTerminal(
        'legacy-terminal-1',
        { deviceId: 'device-real' },
        admin,
      ),
    ).resolves.toMatchObject({ deviceId: 'device-real' });
  });

  it('only lists the terminal registered to a seller device', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findMany.mockResolvedValue([]);
    const { service } = createService(prisma);

    await service.listTerminals(
      { operationalLocationId: 'loc-1', deviceId: 'device-1', isActive: true },
      cashier,
    );

    expect(prisma.cashTerminal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          operationalLocationId: 'loc-1',
          deviceId: 'device-1',
          isActive: true,
        },
      }),
    );
    await expect(
      service.listTerminals({ operationalLocationId: 'loc-1' }, cashier),
    ).rejects.toThrow(new BadRequestException('CASH_TERMINAL_DEVICE_REQUIRED'));
  });

  it('issues a short-lived activation code without persisting the plaintext value', async () => {
    const prisma = createPrisma();
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-1',
      isActive: true,
      type: 'BRANCH',
    });
    prisma.cashTerminalActivation.updateMany.mockResolvedValue({ count: 0 });
    prisma.cashTerminalActivation.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'activation-1', ...data }),
    );
    const { service } = createService(prisma);

    const result = await service.requestTerminalActivation(
      { deviceId: 'device-real' },
      cashier,
    );

    expect(result.activationCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.cashTerminalActivation.updateMany).toHaveBeenCalledWith({
      where: { deviceId: 'device-real', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.cashTerminalActivation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operationalLocationId: 'loc-1',
        requestedByUserId: 'cashier-1',
        deviceId: 'device-real',
        codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it('atomically binds a legacy terminal with a valid activation code', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'legacy-terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'legacy:hash',
    });
    prisma.cashTerminalActivation.findUnique.mockResolvedValue({
      id: 'activation-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-real',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.cashTerminalActivation.updateMany.mockResolvedValue({ count: 1 });
    prisma.cashTerminal.update.mockResolvedValue({
      id: 'legacy-terminal-1',
      deviceId: 'device-real',
    });
    const { service } = createService(prisma);

    await expect(
      service.activateMigratedTerminal(
        'legacy-terminal-1',
        { activationCode: 'ABCDE-23456' },
        admin,
      ),
    ).resolves.toMatchObject({ deviceId: 'device-real' });
    expect(prisma.cashTerminalActivation.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'activation-1', consumedAt: null }),
      data: expect.objectContaining({
        consumedByUserId: 'admin-1',
        cashTerminalId: 'legacy-terminal-1',
      }),
    });
    expect(prisma.cashTerminal.update).toHaveBeenCalledWith({
      where: { id: 'legacy-terminal-1' },
      data: { deviceId: 'device-real' },
    });
  });

  it('does not activate a bound terminal or accept a code from another location', async () => {
    const prisma = createPrisma();
    const { service } = createService(prisma);
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-existing',
    });

    await expect(
      service.activateMigratedTerminal(
        'terminal-1',
        { activationCode: 'ABCDE-23456' },
        admin,
      ),
    ).rejects.toThrow(new ConflictException('CASH_TERMINAL_ALREADY_BOUND'));

    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'legacy-terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'legacy:hash',
    });
    prisma.cashTerminalActivation.findUnique.mockResolvedValue({
      id: 'activation-1',
      operationalLocationId: 'loc-2',
      deviceId: 'device-real',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      service.activateMigratedTerminal(
        'legacy-terminal-1',
        { activationCode: 'ABCDE-23456' },
        admin,
      ),
    ).rejects.toThrow(
      new BadRequestException('CASH_TERMINAL_ACTIVATION_INVALID'),
    );
    expect(prisma.cashTerminal.update).not.toHaveBeenCalled();
  });

  it('rejects consumed, expired, and concurrently claimed activation codes', async () => {
    const prisma = createPrisma();
    const { service } = createService(prisma);
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'legacy-terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'legacy:hash',
    });
    prisma.cashTerminalActivation.findUnique.mockResolvedValue({
      id: 'activation-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-real',
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.activateMigratedTerminal(
        'legacy-terminal-1',
        { activationCode: 'ABCDE-23456' },
        admin,
      ),
    ).rejects.toThrow(
      new BadRequestException('CASH_TERMINAL_ACTIVATION_INVALID'),
    );

    prisma.cashTerminalActivation.findUnique.mockResolvedValue({
      id: 'activation-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-real',
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(
      service.activateMigratedTerminal(
        'legacy-terminal-1',
        { activationCode: 'ABCDE-23456' },
        admin,
      ),
    ).rejects.toThrow(
      new BadRequestException('CASH_TERMINAL_ACTIVATION_INVALID'),
    );

    prisma.cashTerminalActivation.findUnique.mockResolvedValue({
      id: 'activation-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-real',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.cashTerminalActivation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.activateMigratedTerminal(
        'legacy-terminal-1',
        { activationCode: 'ABCDE-23456' },
        admin,
      ),
    ).rejects.toThrow(
      new ConflictException('CASH_TERMINAL_ACTIVATION_ALREADY_USED'),
    );
    expect(prisma.cashTerminal.update).not.toHaveBeenCalled();
  });

  it('rejects opening a shift when the consolidated close is no longer editable', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-1',
      isActive: true,
      operationalLocation: { isActive: true, type: 'BRANCH' },
    });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({
      id: 'close-1',
      status: 'CLOSED',
    });
    const { service } = createService(prisma);

    await expect(
      service.openShift(
        {
          terminalId: 'terminal-1',
          deviceId: 'device-1',
          businessDate: '2026-07-27',
        },
        cashier,
      ),
    ).rejects.toThrow(new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'));
    expect(prisma.cashShift.create).not.toHaveBeenCalled();
  });

  it('does not insert a shift when the parent becomes reviewed before the lifecycle lock', async () => {
    const prisma = createPrisma();
    prisma.cashTerminal.findUnique.mockResolvedValue({
      id: 'terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-1',
      isActive: true,
      operationalLocation: { isActive: true, type: 'BRANCH' },
    });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({
      id: 'close-1',
      status: 'DRAFT',
    });
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      status: 'REVIEWED',
    });
    const { service } = createService(prisma);

    await expect(
      service.openShift(
        {
          terminalId: 'terminal-1',
          deviceId: 'device-1',
          businessDate: '2026-07-27',
          initialCashFund: 6000,
        },
        cashier,
      ),
    ).rejects.toThrow(new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'));

    expect(prisma.cashShift.create).not.toHaveBeenCalled();
  });

  it('rejects opening when the terminal becomes inactive before the under-lock reread', async () => {
    const prisma = createPrisma();
    const terminal = {
      id: 'terminal-1',
      operationalLocationId: 'loc-1',
      deviceId: 'device-1',
      isActive: true,
      operationalLocation: { isActive: true, type: 'BRANCH' },
    };
    prisma.cashTerminal.findUnique
      .mockResolvedValueOnce(terminal)
      .mockResolvedValueOnce({
        ...terminal,
        isActive: false,
      });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({
      id: 'close-1',
      status: 'DRAFT',
    });
    const { service } = createService(prisma);

    await expect(
      service.openShift(
        {
          terminalId: 'terminal-1',
          deviceId: 'device-1',
          businessDate: '2026-07-27',
        },
        cashier,
      ),
    ).rejects.toThrow(new NotFoundException('CASH_TERMINAL_NOT_FOUND'));

    expect(prisma.cashShift.create).not.toHaveBeenCalled();
  });

  it('counts opening deposits and withdrawals only once when closing a shift', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'OPEN',
      cashierUserId: 'collector-1',
      pointOfSaleDailyCloseId: 'close-1',
      initialCashFund: 100,
      initialCashIn: 20,
      initialCashOut: 10,
      operationalLocationId: 'loc-1',
      terminal: { deviceId: 'device-1', isActive: true },
    });
    prisma.cashShift.updateMany.mockResolvedValue({ count: 1 });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    prisma.cashMovement.aggregate.mockImplementation(
      ({ where }: { where: { type: string | { in: string[] } } }) => {
        const amounts: Record<string, number> = {
          CASH_IN: 5,
          CASH_OUT: 3,
          EXPENSE: 2,
        };
        const type = typeof where.type === 'string' ? where.type : 'CASH_OUT';
        return Promise.resolve({ _sum: { amount: amounts[type] } });
      },
    );
    prisma.cashShift.update.mockResolvedValue({
      id: 'shift-1',
      status: 'CLOSED',
    });
    const { service, dailyCloseService } = createService(prisma);

    await service.closeShift(
      'shift-1',
      { deviceId: 'device-1', cashCountedTotal: 165 },
      collectionCashier,
    );

    expect(prisma.cashMovement.aggregate).toHaveBeenCalledWith({
      where: {
        cashShiftId: 'shift-1',
        type: 'CASH_IN',
        movementChannel: 'CASH',
        isOpening: false,
      },
      _sum: { amount: true },
    });
    expect(prisma.cashMovement.aggregate).toHaveBeenCalledWith({
      where: {
        cashShiftId: 'shift-1',
        type: { in: ['CASH_OUT', 'ADJUSTMENT'] },
        movementChannel: 'CASH',
        isOpening: false,
      },
      _sum: { amount: true },
    });
    expect(prisma.cashShift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashCountedTotal: 165,
          cashDifferenceTotal: 5,
          closeMode: 'CASHIER',
          closeReason: null,
        }),
      }),
    );
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledWith('close-1', prisma);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
  });

  it('allows an authorized administrator to close a shift without the original device', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-abandoned',
      status: 'OPEN',
      cashierUserId: 'cashier-1',
      pointOfSaleDailyCloseId: 'close-1',
      initialCashFund: 100,
      initialCashIn: 0,
      initialCashOut: 0,
      operationalLocationId: 'loc-1',
      terminal: { deviceId: 'unreachable-device', isActive: false },
    });
    prisma.cashShift.updateMany.mockResolvedValue({ count: 1 });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    prisma.cashMovement.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.cashShift.update.mockResolvedValue({
      id: 'shift-abandoned',
      status: 'CLOSED',
      closeMode: 'ADMINISTRATIVE',
    });

    const { service } = createService(prisma);

    await service.closeShift(
      'shift-abandoned',
      {
        cashCountedTotal: 145,
        administrativeReason: 'Terminal inaccesible; conteo físico verificado',
      },
      admin,
    );

    expect(prisma.cashShift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          closeMode: 'ADMINISTRATIVE',
          closeReason: 'Terminal inaccesible; conteo físico verificado',
        }),
      }),
    );
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pointOfSaleDailyCloseId: 'close-1',
          type: 'CASH_SHIFT_CLOSED',
          createdByUserId: 'admin-1',
        }),
      }),
    );
  });

  it('rejects a normal close without the own-close permission', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'OPEN',
      cashierUserId: 'collector-1',
      terminal: { deviceId: 'device-1', isActive: true },
    });
    const { service } = createService(prisma);

    await expect(
      service.closeShift(
        'shift-1',
        { deviceId: 'device-1', cashCountedTotal: 100 },
        {
          ...collectionCashier,
          permissions: [
            PERMISSIONS.COLLECTIONS_RECEIVE_CASH,
            PERMISSIONS.CASH_SHIFT_OPEN_OWN,
          ],
        },
      ),
    ).rejects.toThrow(
      new ForbiddenException('CASH_SHIFT_CLOSE_PERMISSION_REQUIRED'),
    );

    expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
  });

  it('reopens the same closed shift after verifying the authenticated cashier password', async () => {
    const prisma = createPrisma();
    const closedShift = {
      id: 'shift-1',
      status: 'CLOSED',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
      closedAt: new Date('2026-07-27T18:00:00.000Z'),
      closedByUserId: 'cashier-1',
      cashCountedTotal: 165,
      cashDifferenceTotal: 5,
      closeMode: 'CASHIER',
      closeReason: null,
      version: 4,
    };
    prisma.cashShift.findUnique
      .mockResolvedValueOnce(closedShift)
      .mockResolvedValueOnce(closedShift)
      .mockResolvedValueOnce({
        ...closedShift,
        status: 'OPEN',
        closedAt: null,
        closedByUserId: null,
        cashCountedTotal: null,
        cashDifferenceTotal: null,
        closeMode: null,
        closeReason: null,
        version: 5,
      });
    prisma.cashShift.updateMany.mockResolvedValue({ count: 1 });
    const { service, authService, dailyCloseService } = createService(prisma);

    await expect(
      service.reopenShift(
        'shift-1',
        { deviceId: 'device-1', password: 'valid-password' },
        cashier,
      ),
    ).resolves.toMatchObject({ id: 'shift-1', status: 'OPEN' });

    expect(authService.verifyPassword).toHaveBeenCalledWith(
      'cashier-1',
      'valid-password',
    );
    expect(prisma.cashShift.updateMany).toHaveBeenCalledWith({
      where: { id: 'shift-1', status: 'CLOSED' },
      data: {
        status: 'OPEN',
        closedAt: null,
        closedByUserId: null,
        cashCountedTotal: null,
        cashDifferenceTotal: null,
        closeMode: null,
        closeReason: null,
        version: { increment: 1 },
      },
    });
    expect(prisma.cashShift.create).not.toHaveBeenCalled();
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    expect(prisma.cashShift.update).not.toHaveBeenCalled();
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pointOfSaleDailyCloseId: 'close-1',
          type: 'STATUS_CHANGED',
          createdByUserId: 'cashier-1',
        }),
      }),
    );
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledWith('close-1', prisma);
  });

  it('never verifies a client-supplied user id when reopening a shift', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'CLOSED',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
    });
    prisma.cashShift.updateMany.mockResolvedValue({ count: 1 });
    const { service, authService } = createService(prisma);

    await service.reopenShift(
      'shift-1',
      {
        deviceId: 'device-1',
        password: 'cashier-password',
        userId: 'admin-1',
      } as never,
      cashier,
    );

    expect(authService.verifyPassword).toHaveBeenCalledWith(
      'cashier-1',
      'cashier-password',
    );
  });

  it('does not mutate a shift when the password is invalid', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'CLOSED',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
    });
    const { service, authService } = createService(prisma);
    authService.verifyPassword.mockRejectedValueOnce(
      new ForbiddenException('Invalid credentials'),
    );

    await expect(
      service.reopenShift(
        'shift-1',
        { deviceId: 'device-1', password: 'wrong-password' },
        cashier,
      ),
    ).rejects.toThrow(new ForbiddenException('Invalid credentials'));

    expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
    expect(prisma.cashShift.update).not.toHaveBeenCalled();
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'the shift belongs to another cashier',
      shift: { cashierUserId: 'cashier-2' },
      error: new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH'),
    },
    {
      name: 'the device does not match the terminal',
      shift: { terminal: { deviceId: 'other-device', isActive: true } },
      error: new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH'),
    },
  ])('rejects reopening when $name', async ({ shift, error }) => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'CLOSED',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
      ...shift,
    });
    const { service, authService } = createService(prisma);

    await expect(
      service.reopenShift(
        'shift-1',
        { deviceId: 'device-1', password: 'valid-password' },
        cashier,
      ),
    ).rejects.toThrow(error);

    expect(authService.verifyPassword).not.toHaveBeenCalled();
    expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
  });

  it('rejects reopening when the terminal already has another open shift', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      terminalId: 'terminal-1',
      status: 'CLOSED',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
    });
    prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift-open-2' });
    const { service, authService } = createService(prisma);

    await expect(
      service.reopenShift(
        'shift-1',
        { deviceId: 'device-1', password: 'valid-password' },
        cashier,
      ),
    ).rejects.toThrow(new ConflictException('CASH_SHIFT_ALREADY_OPEN'));

    expect(authService.verifyPassword).not.toHaveBeenCalled();
    expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['OPEN', 'CASH_SHIFT_ALREADY_OPEN'],
    ['CANCELLED', 'CASH_SHIFT_CANCELLED'],
  ] as const)(
    'rejects reopening a %s shift without writing',
    async (status, code) => {
      const prisma = createPrisma();
      prisma.cashShift.findUnique.mockResolvedValue({
        id: 'shift-1',
        status,
        cashierUserId: 'cashier-1',
        operationalLocationId: 'loc-1',
        pointOfSaleDailyCloseId: 'close-1',
        terminal: { deviceId: 'device-1', isActive: true },
      });
      const { service } = createService(prisma);

      await expect(
        service.reopenShift(
          'shift-1',
          { deviceId: 'device-1', password: 'valid-password' },
          cashier,
        ),
      ).rejects.toThrow(new ConflictException(code));

      expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    },
  );

  it('rejects reopening when the parent daily close is not editable', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'CLOSED',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
    });
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      status: 'REVIEWED',
    });
    const { service, authService } = createService(prisma);

    await expect(
      service.reopenShift(
        'shift-1',
        { deviceId: 'device-1', password: 'valid-password' },
        cashier,
      ),
    ).rejects.toThrow(new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'));

    expect(authService.verifyPassword).not.toHaveBeenCalled();
    expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a normal shift close when terminal ownership changes before the under-lock reread', async () => {
    const prisma = createPrisma();
    const shift = {
      id: 'shift-1',
      status: 'OPEN',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      initialCashFund: 100,
      initialCashIn: 0,
      initialCashOut: 0,
      terminal: { deviceId: 'device-1', isActive: true },
    };
    prisma.cashShift.findUnique
      .mockResolvedValueOnce(shift)
      .mockResolvedValueOnce({
        ...shift,
        terminal: { deviceId: 'other-device', isActive: true },
      });
    const { service } = createService(prisma);

    await expect(
      service.closeShift(
        'shift-1',
        { deviceId: 'device-1', cashCountedTotal: 100 },
        cashier,
      ),
    ).rejects.toThrow(new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH'));

    expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
  });

  it('rejects administrative closure without its critical permission', async () => {
    const prisma = createPrisma();
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-abandoned',
      status: 'OPEN',
      cashierUserId: 'cashier-1',
      terminal: { deviceId: 'unreachable-device' },
    });
    const { service } = createService(prisma);

    await expect(
      service.closeShift(
        'shift-abandoned',
        {
          cashCountedTotal: 145,
          administrativeReason: 'Terminal inaccesible',
        },
        { ...admin, permissions: [] },
      ),
    ).rejects.toThrow(
      new ForbiddenException('CASH_SHIFT_ADMINISTRATIVE_PERMISSION_REQUIRED'),
    );
    expect(prisma.cashShift.updateMany).not.toHaveBeenCalled();
  });

  it('recalculates the parent through a sequential same-terminal lifecycle without duplicating rollover cash', async () => {
    const prisma = createPrisma();
    const terminal = {
      id: 'terminal-1',
      code: 'C01',
      name: 'Caja 01',
      deviceId: 'device-1',
      operationalLocationId: 'loc-1',
      isActive: true,
      operationalLocation: { isActive: true, type: 'BRANCH' },
    };
    const shifts: Array<Record<string, unknown>> = [
      {
        id: 'shift-1',
        terminalId: terminal.id,
        operationalLocationId: 'loc-1',
        pointOfSaleDailyCloseId: 'close-1',
        cashierUserId: 'cashier-1',
        businessDate: new Date('2026-08-04T00:00:00.000Z'),
        status: 'OPEN',
        openedAt: new Date('2026-08-04T08:00:00.000Z'),
        createdAt: new Date('2026-08-04T08:00:00.000Z'),
        initialCashFund: 0,
        initialCashIn: 0,
        initialCashOut: 0,
        cashCountedTotal: null,
      },
    ];
    const payments = [
      {
        cashShiftId: 'shift-1',
        paymentMethod: 'CASH',
        status: 'APPLIED',
        amount: 6000,
      },
    ];
    const movements: Array<Record<string, unknown>> = [];
    const parent: Record<string, unknown> = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-08-04T00:00:00.000Z'),
      status: 'DRAFT',
      version: 1,
      initialCashFund: 0,
      initialCashIn: 0,
      initialCashOut: 0,
      cashCountedTotal: null,
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      sales: [],
      differences: [],
      updatedAt: new Date('2026-08-04T08:00:00.000Z'),
    };
    const closeRecord = () => ({
      ...parent,
      cashShifts: shifts.map((shift) => ({ ...shift })),
      cashMovements: movements.map((movement) => ({ ...movement })),
      payments: payments.map((payment) => ({ ...payment })),
    });
    const shiftRecord = (id: string) => {
      const shift = shifts.find((candidate) => candidate.id === id);
      return shift ? { ...shift, terminal } : null;
    };

    prisma.cashTerminal.findUnique.mockResolvedValue(terminal);
    prisma.pointOfSaleDailyClose.findFirst.mockImplementation(() =>
      Promise.resolve({ id: 'close-1', status: parent.status }),
    );
    prisma.pointOfSaleDailyClose.findUnique.mockImplementation(
      ({ select }: { select?: { status?: boolean } }) =>
        Promise.resolve(
          select?.status ? { status: parent.status } : closeRecord(),
        ),
    );
    prisma.pointOfSaleDailyClose.updateMany.mockImplementation(
      ({ where }: { where: { status?: string } }) => {
        if (where.status && where.status !== parent.status)
          return Promise.resolve({ count: 0 });
        parent.version = Number(parent.version) + 1;
        return Promise.resolve({ count: 1 });
      },
    );
    prisma.pointOfSaleDailyClose.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(parent, data, { updatedAt: new Date() });
        return Promise.resolve(closeRecord());
      },
    );
    prisma.cashShift.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        return Promise.resolve(shiftRecord(where.id));
      },
    );
    prisma.cashShift.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: 'shift-2',
          status: 'OPEN',
          createdAt: data.openedAt,
          cashCountedTotal: null,
          ...data,
        };
        shifts.push(created);
        return Promise.resolve({ ...created, terminal });
      },
    );
    prisma.cashShift.updateMany.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: Record<string, unknown>;
      }) => {
        const shift = shifts.find(
          (candidate) =>
            candidate.id === where.id && candidate.status === where.status,
        );
        if (!shift) return Promise.resolve({ count: 0 });
        Object.assign(shift, data);
        return Promise.resolve({ count: 1 });
      },
    );
    prisma.cashShift.update.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const shift = shifts.find((candidate) => candidate.id === where.id);
        Object.assign(shift!, data);
        return Promise.resolve(shiftRecord(where.id));
      },
    );
    prisma.payment.aggregate.mockImplementation(
      ({ where }: { where: { cashShiftId: string } }) =>
        Promise.resolve({
          _sum: {
            amount: payments
              .filter((payment) => payment.cashShiftId === where.cashShiftId)
              .reduce((total, payment) => total + payment.amount, 0),
          },
        }),
    );
    prisma.cashMovement.aggregate.mockImplementation(
      ({
        where,
      }: {
        where: { cashShiftId: string; type: string | { in: string[] } };
      }) => {
        const types =
          typeof where.type === 'string' ? [where.type] : where.type.in;
        return Promise.resolve({
          _sum: {
            amount: movements
              .filter(
                (movement) =>
                  movement.cashShiftId === where.cashShiftId &&
                  types.includes(String(movement.type)),
              )
              .reduce((total, movement) => total + Number(movement.amount), 0),
          },
        });
      },
    );
    prisma.cashMovement.findUnique.mockImplementation(
      ({ where }: { where: { idempotencyKey: string } }) =>
        Promise.resolve(
          movements.find(
            (movement) => movement.idempotencyKey === where.idempotencyKey,
          ) ?? null,
        ),
    );
    prisma.cashMovement.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        const movement = { id: `movement-${movements.length + 1}`, ...data };
        movements.push(movement);
        return Promise.resolve(movement);
      },
    );
    prisma.sale.updateMany.mockResolvedValue({ count: 0 });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    prisma.inventoryMovement.updateMany.mockResolvedValue({ count: 0 });
    prisma.inventoryMovement.findMany.mockResolvedValue([]);
    prisma.dailyCloseInventoryCount.findMany.mockResolvedValue([]);
    prisma.dailyCloseDifference.findMany.mockResolvedValue([]);
    prisma.dailyCloseDifference.upsert.mockResolvedValue({});
    prisma.dailyCloseEvent.create.mockResolvedValue({ id: 'event-1' });

    const dailyCloseService = new PointOfSaleDailyCloseService(prisma as never);
    const service = new CashManagementService(
      prisma as unknown as PrismaService,
      dailyCloseService,
      { verifyPassword: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.closeShift(
      'shift-1',
      { deviceId: 'device-1', cashCountedTotal: 6000 },
      cashier,
    );
    expect(parent).toMatchObject({
      netCashExpected: 6000,
      cashCountedTotal: 6000,
    });

    const successor = await service.openShift(
      {
        terminalId: 'terminal-1',
        deviceId: 'device-1',
        businessDate: '2026-08-04',
        initialCashFund: 6000,
      },
      cashier,
    );
    await service.recordMovement(
      successor.id,
      {
        deviceId: 'device-1',
        type: 'CASH_IN',
        amount: 200,
        reason: 'Ingreso adicional',
      },
      cashier,
      'shift-2-cash-in-200',
    );
    await service.closeShift(
      successor.id,
      { deviceId: 'device-1', cashCountedTotal: 6200 },
      cashier,
    );

    expect(parent).toMatchObject({
      cashTotal: 6000,
      netCashExpected: 6200,
      cashCountedTotal: 6200,
      cashDifferenceTotal: 0,
    });
    expect(parent.cashCountedTotal).not.toBe(12200);
  });

  it('replays an idempotent movement without creating a duplicate', async () => {
    const prisma = createPrisma();
    const shift = {
      id: 'shift-1',
      status: 'OPEN',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
    };
    prisma.cashShift.findUnique.mockResolvedValue(shift);
    prisma.cashMovement.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'movement-1', ...data }),
    );
    const { service, dailyCloseService } = createService(prisma);
    const dto = {
      deviceId: 'device-1',
      type: 'EXPENSE' as const,
      amount: 25,
      reason: 'Hielo',
    };

    const created = await service.recordMovement(
      'shift-1',
      dto,
      cashier,
      'movement-key',
    );
    prisma.cashMovement.findUnique.mockResolvedValue(created);
    const replayed = await service.recordMovement(
      'shift-1',
      dto,
      cashier,
      'movement-key',
    );

    expect(replayed).toMatchObject({ id: 'movement-1' });
    expect(prisma.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledTimes(1);
    expect(
      dailyCloseService.recalculateAfterDraftMutation,
    ).toHaveBeenCalledWith('close-1', prisma);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
  });

  it('rejects a movement when the cashier changes before the under-lock reread', async () => {
    const prisma = createPrisma();
    const shift = {
      id: 'shift-1',
      status: 'OPEN',
      cashierUserId: 'cashier-1',
      operationalLocationId: 'loc-1',
      pointOfSaleDailyCloseId: 'close-1',
      terminal: { deviceId: 'device-1', isActive: true },
    };
    prisma.cashShift.findUnique
      .mockResolvedValueOnce(shift)
      .mockResolvedValueOnce({ ...shift, cashierUserId: 'cashier-2' });
    prisma.cashMovement.findUnique.mockResolvedValue(null);
    const { service } = createService(prisma);

    await expect(
      service.recordMovement(
        'shift-1',
        {
          deviceId: 'device-1',
          type: 'EXPENSE',
          amount: 25,
          reason: 'Hielo',
        },
        cashier,
        'movement-key-cashier-race',
      ),
    ).rejects.toThrow(new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH'));

    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });
});
