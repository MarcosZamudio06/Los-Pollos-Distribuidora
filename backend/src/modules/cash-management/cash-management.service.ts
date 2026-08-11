import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashShiftCloseMode,
  CashShiftStatus,
  DailyCloseEventType,
  OperationalLocationType,
  Prisma,
} from '@prisma/client';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
import { acquireDailyCloseLifecycleLock } from '../point-of-sale-daily-close/daily-close-lifecycle-lock';
import {
  ActivateMigratedCashTerminalDto,
  CloseCashShiftDto,
  CreateCashShiftMovementDto,
  CreateCashTerminalDto,
  ListCashTerminalQueryDto,
  OpenCashShiftDto,
  RequestCashTerminalActivationDto,
  ReopenCashShiftDto,
  UpdateCashTerminalDto,
} from './dto';

const shiftInclude = {
  terminal: {
    select: {
      id: true,
      code: true,
      name: true,
      deviceId: true,
      operationalLocationId: true,
    },
  },
  cashier: { select: { id: true, name: true } },
  pointOfSaleDailyClose: {
    select: {
      id: true,
      operationalLocationId: true,
      businessDate: true,
      status: true,
    },
  },
} satisfies Prisma.CashShiftInclude;

const cashTerminalLocationTypes = new Set<OperationalLocationType>([
  OperationalLocationType.BRANCH,
  OperationalLocationType.MIXED,
  OperationalLocationType.EXTERNAL_POINT_OF_SALE,
]);
const terminalActivationAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const terminalActivationTtlMs = 15 * 60 * 1000;

@Injectable()
export class CashManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyCloseService: PointOfSaleDailyCloseService,
    private readonly authService: AuthService,
  ) {}

  async createTerminal(dto: CreateCashTerminalDto, user: AuthenticatedUser) {
    this.requirePermission(user, PERMISSIONS.CASH_TERMINALS_REASSIGN);
    try {
      return await this.prisma.cashTerminal.create({
        data: {
          operationalLocationId: dto.operationalLocationId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          deviceId: dto.deviceId.trim(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('CASH_TERMINAL_ALREADY_EXISTS');
      throw error;
    }
  }

  async listTerminals(
    query: ListCashTerminalQueryDto,
    user: AuthenticatedUser,
  ) {
    this.requirePermission(
      user,
      PERMISSIONS.CASH_SHIFT_OPEN_OWN,
      'CASH_SHIFT_OPEN_PERMISSION_REQUIRED',
    );
    const locationId =
      user.role === 'ADMIN'
        ? query.operationalLocationId
        : user.operationalLocationId;
    if (
      user.role !== 'ADMIN' &&
      query.operationalLocationId &&
      query.operationalLocationId !== user.operationalLocationId
    )
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    if (user.role !== 'ADMIN' && !query.deviceId?.trim())
      throw new BadRequestException('CASH_TERMINAL_DEVICE_REQUIRED');
    return this.prisma.cashTerminal.findMany({
      where: {
        ...(locationId ? { operationalLocationId: locationId } : {}),
        ...(query.deviceId?.trim() ? { deviceId: query.deviceId.trim() } : {}),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      orderBy: [{ operationalLocationId: 'asc' }, { code: 'asc' }],
    });
  }

  async updateTerminal(
    id: string,
    dto: UpdateCashTerminalDto,
    user: AuthenticatedUser,
  ) {
    this.requirePermission(user, PERMISSIONS.CASH_TERMINALS_REASSIGN);
    const terminal = await this.prisma.cashTerminal.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!terminal) throw new NotFoundException('CASH_TERMINAL_NOT_FOUND');
    try {
      return await this.prisma.cashTerminal.update({
        where: { id },
        data: {
          ...(dto.code === undefined ? {} : { code: dto.code.trim() }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.deviceId === undefined
            ? {}
            : { deviceId: dto.deviceId.trim() }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('CASH_TERMINAL_ALREADY_EXISTS');
      throw error;
    }
  }

  async requestTerminalActivation(
    dto: RequestCashTerminalActivationDto,
    user: AuthenticatedUser,
  ) {
    const deviceId = dto.deviceId.trim();
    if (deviceId.startsWith('legacy:'))
      throw new BadRequestException('CASH_TERMINAL_DEVICE_INVALID');
    if (
      user.role !== 'ADMIN' &&
      dto.operationalLocationId &&
      dto.operationalLocationId !== user.operationalLocationId
    )
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    const operationalLocationId =
      user.role === 'ADMIN'
        ? dto.operationalLocationId?.trim() || user.operationalLocationId
        : user.operationalLocationId;
    if (!operationalLocationId)
      throw new BadRequestException('OPERATIONAL_LOCATION_REQUIRED');
    const location = await this.prisma.operationalLocation.findUnique({
      where: { id: operationalLocationId },
      select: { id: true, isActive: true, type: true },
    });
    if (!location?.isActive) throw new BadRequestException('LOCATION_INACTIVE');
    if (!cashTerminalLocationTypes.has(location.type))
      throw new BadRequestException('LOCATION_NOT_POINT_OF_SALE');

    const compactCode = Array.from(
      { length: 10 },
      () =>
        terminalActivationAlphabet[
          randomInt(terminalActivationAlphabet.length)
        ],
    ).join('');
    const activationCode = `${compactCode.slice(0, 5)}-${compactCode.slice(5)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + terminalActivationTtlMs);
    await this.prisma.$transaction(async (tx) => {
      await tx.cashTerminalActivation.updateMany({
        where: { deviceId, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.cashTerminalActivation.create({
        data: {
          operationalLocationId,
          requestedByUserId: user.id,
          deviceId,
          codeHash: this.hash(compactCode),
          expiresAt,
        },
      });
    });
    return { activationCode, expiresAt, operationalLocationId, deviceId };
  }

  async activateMigratedTerminal(
    id: string,
    dto: ActivateMigratedCashTerminalDto,
    user: AuthenticatedUser,
  ) {
    this.requirePermission(user, PERMISSIONS.CASH_TERMINALS_REASSIGN);
    const compactCode = dto.activationCode.toUpperCase().replace(/[-\s]/g, '');
    if (!/^[A-Z2-9]{10}$/.test(compactCode))
      throw new BadRequestException('CASH_TERMINAL_ACTIVATION_INVALID');
    const now = new Date();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const terminal = await tx.cashTerminal.findUnique({
            where: { id },
            select: { id: true, operationalLocationId: true, deviceId: true },
          });
          if (!terminal) throw new NotFoundException('CASH_TERMINAL_NOT_FOUND');
          if (!terminal.deviceId.startsWith('legacy:'))
            throw new ConflictException('CASH_TERMINAL_ALREADY_BOUND');
          const activation = await tx.cashTerminalActivation.findUnique({
            where: { codeHash: this.hash(compactCode) },
          });
          if (
            !activation ||
            activation.consumedAt ||
            activation.expiresAt <= now ||
            activation.operationalLocationId !== terminal.operationalLocationId
          ) {
            throw new BadRequestException('CASH_TERMINAL_ACTIVATION_INVALID');
          }
          const claim = await tx.cashTerminalActivation.updateMany({
            where: {
              id: activation.id,
              consumedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              consumedAt: now,
              consumedByUserId: user.id,
              cashTerminalId: terminal.id,
            },
          });
          if (claim.count !== 1)
            throw new ConflictException(
              'CASH_TERMINAL_ACTIVATION_ALREADY_USED',
            );
          return tx.cashTerminal.update({
            where: { id: terminal.id },
            data: { deviceId: activation.deviceId },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('CASH_TERMINAL_DEVICE_ALREADY_REGISTERED');
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException('CASH_TERMINAL_ACTIVATION_ALREADY_USED');
      throw error;
    }
  }

  async currentShift(deviceId: string, user: AuthenticatedUser) {
    this.requirePermission(
      user,
      PERMISSIONS.CASH_SHIFT_OPEN_OWN,
      'CASH_SHIFT_OPEN_PERMISSION_REQUIRED',
    );
    return this.prisma.cashShift.findFirst({
      where: {
        cashierUserId: user.id,
        status: CashShiftStatus.OPEN,
        terminal: { deviceId: deviceId.trim(), isActive: true },
        pointOfSaleDailyClose: { status: 'DRAFT' },
      },
      include: shiftInclude,
      orderBy: { openedAt: 'desc' },
    });
  }

  async openShift(dto: OpenCashShiftDto, user: AuthenticatedUser) {
    this.requirePermission(
      user,
      PERMISSIONS.CASH_SHIFT_OPEN_OWN,
      'CASH_SHIFT_OPEN_PERMISSION_REQUIRED',
    );
    const terminal = await this.prisma.cashTerminal.findUnique({
      where: { id: dto.terminalId },
      include: {
        operationalLocation: { select: { isActive: true, type: true } },
      },
    });
    if (!terminal?.isActive)
      throw new NotFoundException('CASH_TERMINAL_NOT_FOUND');
    if (!terminal.operationalLocation.isActive)
      throw new BadRequestException('LOCATION_INACTIVE');
    if (!cashTerminalLocationTypes.has(terminal.operationalLocation.type))
      throw new BadRequestException('LOCATION_NOT_POINT_OF_SALE');
    if (terminal.deviceId !== dto.deviceId.trim())
      throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
    if (
      user.role !== 'ADMIN' &&
      terminal.operationalLocationId !== user.operationalLocationId
    )
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');

    const businessDate = this.date(dto.businessDate);
    if (businessDate > this.date(this.currentOperationalDate()))
      throw new BadRequestException('DAILY_CLOSE_FUTURE_DATE');
    const initialCashFund = this.money(dto.initialCashFund);
    const initialCashIn = this.money(dto.initialCashIn);
    const initialCashOut = this.money(dto.initialCashOut);
    if (initialCashOut > initialCashFund + initialCashIn)
      throw new BadRequestException('INITIAL_CASH_OUT_EXCEEDS_AVAILABLE');
    const openedAt = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          `daily-close:${terminal.operationalLocationId}:${dto.businessDate.slice(0, 10)}`,
        );
        const existingDailyClose = await tx.pointOfSaleDailyClose.findFirst({
          where: {
            operationalLocationId: terminal.operationalLocationId,
            businessDate,
            status: { not: 'CANCELLED' },
          },
          select: { id: true, status: true },
        });
        if (existingDailyClose && existingDailyClose.status !== 'DRAFT')
          throw new BadRequestException('DAILY_CLOSE_NOT_EDITABLE');
        const dailyClose =
          existingDailyClose ??
          (await tx.pointOfSaleDailyClose.create({
            data: {
              operationalLocationId: terminal.operationalLocationId,
              businessDate,
              openedByUserId: user.id,
              terminalIdentifier: 'Consolidado de sucursal',
              initialCashFund: 0,
              initialCashIn: 0,
              initialCashOut: 0,
            },
            select: { id: true, status: true },
          }));

        await acquireDailyCloseLifecycleLock(tx, dailyClose.id);
        await this.assertDailyCloseEditable(tx, dailyClose.id);
        const lockedTerminal = await this.assertTerminalAuthorization(
          tx,
          dto.terminalId,
          dto.deviceId,
          user,
          terminal.operationalLocationId,
        );

        const shift = await tx.cashShift.create({
          data: {
            terminalId: lockedTerminal.id,
            operationalLocationId: lockedTerminal.operationalLocationId,
            pointOfSaleDailyCloseId: dailyClose.id,
            cashierUserId: user.id,
            businessDate,
            openedAt,
            initialCashFund,
            initialCashIn,
            initialCashOut,
            notes: dto.notes?.trim() || null,
          },
          include: shiftInclude,
        });

        if (initialCashIn > 0)
          await tx.cashMovement.create({
            data: {
              operationalLocationId: lockedTerminal.operationalLocationId,
              pointOfSaleDailyCloseId: dailyClose.id,
              cashShiftId: shift.id,
              type: 'CASH_IN',
              movementChannel: 'CASH',
              amount: initialCashIn,
              reason: 'Depósito inicial de apertura',
              reference: lockedTerminal.code,
              isOpening: true,
              occurredAt: openedAt,
              userId: user.id,
              idempotencyKey: `${shift.id}:opening-cash-in`,
              idempotencyPayloadHash: this.hash(
                `${shift.id}:CASH_IN:${initialCashIn}`,
              ),
            },
          });
        if (initialCashOut > 0)
          await tx.cashMovement.create({
            data: {
              operationalLocationId: lockedTerminal.operationalLocationId,
              pointOfSaleDailyCloseId: dailyClose.id,
              cashShiftId: shift.id,
              type: 'CASH_OUT',
              movementChannel: 'CASH',
              amount: initialCashOut,
              reason: 'Retiro inicial de apertura',
              reference: lockedTerminal.code,
              isOpening: true,
              occurredAt: openedAt,
              userId: user.id,
              idempotencyKey: `${shift.id}:opening-cash-out`,
              idempotencyPayloadHash: this.hash(
                `${shift.id}:CASH_OUT:${initialCashOut}`,
              ),
            },
          });
        await this.dailyCloseService.recalculateAfterDraftMutation(
          dailyClose.id,
          tx,
        );
        return shift;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('CASH_SHIFT_ALREADY_OPEN');
      throw error;
    }
  }

  async closeShift(
    id: string,
    dto: CloseCashShiftDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const shift = await tx.cashShift.findUnique({
          where: { id },
          include: { terminal: true },
        });
        if (!shift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
        if (shift.status !== CashShiftStatus.OPEN)
          throw new ConflictException('CASH_SHIFT_NOT_OPEN');
        const administrativeReason = dto.administrativeReason?.trim() || null;
        if (dto.administrativeReason !== undefined && !administrativeReason)
          throw new BadRequestException(
            'CASH_SHIFT_ADMINISTRATIVE_REASON_REQUIRED',
          );
        const isAdministrativeClose = administrativeReason !== null;
        if (isAdministrativeClose) {
          this.requirePermission(
            user,
            PERMISSIONS.CASH_SHIFTS_ADMINISTRATIVE_CLOSE,
            'CASH_SHIFT_ADMINISTRATIVE_PERMISSION_REQUIRED',
          );
        } else {
          this.requirePermission(
            user,
            PERMISSIONS.CASH_SHIFT_CLOSE_OWN,
            'CASH_SHIFT_CLOSE_PERMISSION_REQUIRED',
          );
          if (!dto.deviceId?.trim())
            throw new BadRequestException('CASH_TERMINAL_DEVICE_REQUIRED');
          if (shift.cashierUserId !== user.id && user.role !== 'ADMIN')
            throw new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH');
          if (shift.terminal.deviceId !== dto.deviceId.trim())
            throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
        }
        await acquireDailyCloseLifecycleLock(tx, shift.pointOfSaleDailyCloseId);
        await this.assertDailyCloseEditable(tx, shift.pointOfSaleDailyCloseId);
        const lockedShift = await tx.cashShift.findUnique({
          where: { id },
          include: { terminal: true },
        });
        if (!lockedShift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
        await this.assertActiveCashier(
          tx,
          user,
          lockedShift.operationalLocationId,
        );
        if (lockedShift.status !== CashShiftStatus.OPEN)
          throw new ConflictException('CASH_SHIFT_NOT_OPEN');
        if (!isAdministrativeClose) {
          if (lockedShift.cashierUserId !== user.id && user.role !== 'ADMIN')
            throw new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH');
          if (
            !lockedShift.terminal.isActive ||
            lockedShift.terminal.deviceId !== dto.deviceId?.trim()
          )
            throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
        }
        const closedAt = new Date();
        const transition = await tx.cashShift.updateMany({
          where: { id, status: CashShiftStatus.OPEN },
          data: {
            status: CashShiftStatus.CLOSED,
            closedAt,
            closedByUserId: user.id,
            version: { increment: 1 },
          },
        });
        if (transition.count !== 1)
          throw new ConflictException('CASH_SHIFT_NOT_OPEN');
        const [cashPayments, cashIn, cashOut, expenses] = await Promise.all([
          tx.payment.aggregate({
            where: {
              cashShiftId: id,
              paymentMethod: 'CASH',
              status: 'APPLIED',
            },
            _sum: { amount: true },
          }),
          tx.cashMovement.aggregate({
            where: {
              cashShiftId: id,
              type: 'CASH_IN',
              movementChannel: 'CASH',
              isOpening: false,
            },
            _sum: { amount: true },
          }),
          tx.cashMovement.aggregate({
            where: {
              cashShiftId: id,
              type: { in: ['CASH_OUT', 'ADJUSTMENT'] },
              movementChannel: 'CASH',
              isOpening: false,
            },
            _sum: { amount: true },
          }),
          tx.cashMovement.aggregate({
            where: {
              cashShiftId: id,
              type: 'EXPENSE',
              movementChannel: 'CASH',
              isOpening: false,
            },
            _sum: { amount: true },
          }),
        ]);
        const expected =
          this.money(lockedShift.initialCashFund) +
          this.money(lockedShift.initialCashIn) -
          this.money(lockedShift.initialCashOut) +
          this.money(cashPayments._sum.amount) +
          this.money(cashIn._sum.amount) -
          this.money(cashOut._sum.amount) -
          this.money(expenses._sum.amount);
        const counted = this.money(dto.cashCountedTotal);
        const closed = await tx.cashShift.update({
          where: { id },
          data: {
            cashCountedTotal: counted,
            cashDifferenceTotal: this.money(counted - expected),
            closeMode: isAdministrativeClose
              ? CashShiftCloseMode.ADMINISTRATIVE
              : CashShiftCloseMode.CASHIER,
            closeReason: administrativeReason,
          },
          include: shiftInclude,
        });
        await tx.dailyCloseEvent.create({
          data: {
            pointOfSaleDailyCloseId: lockedShift.pointOfSaleDailyCloseId,
            type: DailyCloseEventType.CASH_SHIFT_CLOSED,
            payload: {
              cashShiftId: lockedShift.id,
              closeMode: isAdministrativeClose
                ? CashShiftCloseMode.ADMINISTRATIVE
                : CashShiftCloseMode.CASHIER,
              cashCountedTotal: counted,
              cashDifferenceTotal: this.money(counted - expected),
              reason: administrativeReason,
            },
            createdByUserId: user.id,
          },
        });
        await this.dailyCloseService.recalculateAfterDraftMutation(
          lockedShift.pointOfSaleDailyCloseId,
          tx,
        );
        return closed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reopenShift(
    id: string,
    dto: ReopenCashShiftDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const shift = await tx.cashShift.findUnique({
          where: { id },
          include: { terminal: true },
        });
        if (!shift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');

        await acquireDailyCloseLifecycleLock(tx, shift.pointOfSaleDailyCloseId);
        await this.assertDailyCloseEditable(tx, shift.pointOfSaleDailyCloseId);

        const lockedShift = await tx.cashShift.findUnique({
          where: { id },
          include: { terminal: true },
        });
        if (!lockedShift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
        if (lockedShift.status === CashShiftStatus.OPEN)
          throw new ConflictException('CASH_SHIFT_ALREADY_OPEN');
        if (lockedShift.status === CashShiftStatus.CANCELLED)
          throw new ConflictException('CASH_SHIFT_CANCELLED');
        if (lockedShift.status !== CashShiftStatus.CLOSED)
          throw new ConflictException('CASH_SHIFT_NOT_CLOSED');

        await this.assertActiveCashier(
          tx,
          user,
          lockedShift.operationalLocationId,
        );
        if (lockedShift.cashierUserId !== user.id)
          throw new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH');
        if (!dto.deviceId.trim())
          throw new BadRequestException('CASH_TERMINAL_DEVICE_REQUIRED');
        if (
          !lockedShift.terminal.isActive ||
          lockedShift.terminal.deviceId !== dto.deviceId.trim()
        )
          throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');

        const anotherOpenShift = await tx.cashShift.findFirst({
          where: {
            terminalId: lockedShift.terminalId,
            status: CashShiftStatus.OPEN,
            id: { not: id },
          },
          select: { id: true },
        });
        if (anotherOpenShift)
          throw new ConflictException('CASH_SHIFT_ALREADY_OPEN');

        await this.authService.verifyPassword(user.id, dto.password);

        const transition = await tx.cashShift.updateMany({
          where: { id, status: CashShiftStatus.CLOSED },
          data: {
            status: CashShiftStatus.OPEN,
            closedAt: null,
            closedByUserId: null,
            cashCountedTotal: null,
            cashDifferenceTotal: null,
            closeMode: null,
            closeReason: null,
            version: { increment: 1 },
          },
        });
        if (transition.count !== 1)
          throw new ConflictException('CASH_SHIFT_NOT_CLOSED');

        const reopened = await tx.cashShift.findUnique({
          where: { id },
          include: shiftInclude,
        });
        if (!reopened) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
        await tx.dailyCloseEvent.create({
          data: {
            pointOfSaleDailyCloseId: lockedShift.pointOfSaleDailyCloseId,
            type: DailyCloseEventType.STATUS_CHANGED,
            payload: {
              entity: 'CASH_SHIFT',
              cashShiftId: lockedShift.id,
              fromStatus: CashShiftStatus.CLOSED,
              toStatus: CashShiftStatus.OPEN,
              sourceVersion: lockedShift.version,
            },
            createdByUserId: user.id,
          },
        });
        await this.dailyCloseService.recalculateAfterDraftMutation(
          lockedShift.pointOfSaleDailyCloseId,
          tx,
        );
        return reopened;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordMovement(
    id: string,
    dto: CreateCashShiftMovementDto,
    user: AuthenticatedUser,
    idempotencyKey: string,
  ) {
    const amount = this.money(dto.amount);
    const reason = dto.reason.trim();
    const reference = dto.reference?.trim() || null;
    const payloadHash = this.hash(
      JSON.stringify({
        cashShiftId: id,
        type: dto.type,
        amount,
        reason,
        reference,
        userId: user.id,
      }),
    );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const shift = await tx.cashShift.findUnique({
            where: { id },
            include: { terminal: true },
          });
          if (!shift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
          if (shift.cashierUserId !== user.id && user.role !== 'ADMIN')
            throw new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH');
          if (shift.terminal.deviceId !== dto.deviceId.trim())
            throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
          const existing = await tx.cashMovement.findUnique({
            where: { idempotencyKey },
          });
          if (existing) {
            if (existing.idempotencyPayloadHash !== payloadHash)
              throw new ConflictException('IDEMPOTENCY_CONFLICT');
            return existing;
          }
          await acquireDailyCloseLifecycleLock(
            tx,
            shift.pointOfSaleDailyCloseId,
          );
          await this.assertDailyCloseEditable(
            tx,
            shift.pointOfSaleDailyCloseId,
          );
          const lockedShift = await tx.cashShift.findUnique({
            where: { id },
            include: { terminal: true },
          });
          if (!lockedShift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
          await this.assertActiveCashier(
            tx,
            user,
            lockedShift.operationalLocationId,
          );
          if (lockedShift.status !== CashShiftStatus.OPEN)
            throw new ConflictException('CASH_SHIFT_NOT_OPEN');
          if (lockedShift.cashierUserId !== user.id && user.role !== 'ADMIN')
            throw new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH');
          if (
            !lockedShift.terminal.isActive ||
            lockedShift.terminal.deviceId !== dto.deviceId.trim()
          )
            throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
          if (!['EXPENSE', 'CASH_IN', 'CASH_OUT'].includes(dto.type))
            throw new BadRequestException('CASH_SHIFT_MOVEMENT_TYPE_INVALID');
          const movement = await tx.cashMovement.create({
            data: {
              operationalLocationId: lockedShift.operationalLocationId,
              pointOfSaleDailyCloseId: lockedShift.pointOfSaleDailyCloseId,
              cashShiftId: lockedShift.id,
              type: dto.type,
              movementChannel: 'CASH',
              amount,
              reason,
              reference,
              isOpening: false,
              occurredAt: new Date(),
              userId: user.id,
              idempotencyKey,
              idempotencyPayloadHash: payloadHash,
            },
          });
          await this.dailyCloseService.recalculateAfterDraftMutation(
            lockedShift.pointOfSaleDailyCloseId,
            tx,
          );
          return movement;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.cashMovement.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          if (existing.idempotencyPayloadHash !== payloadHash)
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return existing;
        }
      }
      throw error;
    }
  }

  private date(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  private async assertDailyCloseEditable(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const dailyClose = await tx.pointOfSaleDailyClose.findUnique({
      where: { id },
      select: { status: true },
    });
    if (dailyClose?.status !== 'DRAFT')
      throw new BadRequestException('DAILY_CLOSE_NOT_EDITABLE');
  }

  private async assertTerminalAuthorization(
    tx: Prisma.TransactionClient,
    terminalId: string,
    deviceId: string,
    user: AuthenticatedUser,
    expectedLocationId?: string,
  ) {
    const terminal = await tx.cashTerminal.findUnique({
      where: { id: terminalId },
      include: {
        operationalLocation: { select: { isActive: true, type: true } },
      },
    });
    if (!terminal?.isActive)
      throw new NotFoundException('CASH_TERMINAL_NOT_FOUND');
    if (
      expectedLocationId &&
      terminal.operationalLocationId !== expectedLocationId
    )
      throw new BadRequestException('CASH_SHIFT_LOCATION_MISMATCH');
    if (!terminal.operationalLocation.isActive)
      throw new BadRequestException('LOCATION_INACTIVE');
    if (!cashTerminalLocationTypes.has(terminal.operationalLocation.type))
      throw new BadRequestException('LOCATION_NOT_POINT_OF_SALE');
    if (terminal.deviceId !== deviceId.trim())
      throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
    await this.assertActiveCashier(tx, user, terminal.operationalLocationId);
    return terminal;
  }

  private async assertActiveCashier(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    locationId: string,
  ) {
    const cashier = await tx.user.findUnique({
      where: { id: user.id },
      select: { id: true, isActive: true, operationalLocationId: true },
    });
    if (!cashier?.isActive) throw new ForbiddenException('User is inactive');
    if (user.role !== 'ADMIN' && cashier.operationalLocationId !== locationId)
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
  }

  private money(value: Prisma.Decimal | number | string | null | undefined) {
    const number = Number(value ?? 0);
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private requirePermission(
    user: AuthenticatedUser,
    permission: string,
    errorCode = 'CASH_TERMINAL_PERMISSION_REQUIRED',
  ) {
    if (!user.permissions?.includes(permission)) {
      throw new ForbiddenException(errorCode);
    }
  }

  private currentOperationalDate(now = new Date()) {
    const timeZone = process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
}
