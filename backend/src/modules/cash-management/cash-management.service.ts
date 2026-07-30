import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CashShiftStatus, OperationalLocationType, Prisma } from '@prisma/client';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS } from '../../common/authorization/permissions';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ActivateMigratedCashTerminalDto, CloseCashShiftDto, CreateCashShiftMovementDto, CreateCashTerminalDto, ListCashTerminalQueryDto, OpenCashShiftDto, RequestCashTerminalActivationDto, UpdateCashTerminalDto } from './dto';

const shiftInclude = {
  terminal: { select: { id: true, code: true, name: true, deviceId: true, operationalLocationId: true } },
  cashier: { select: { id: true, name: true } },
  pointOfSaleDailyClose: { select: { id: true, operationalLocationId: true, businessDate: true, status: true } },
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
  constructor(private readonly prisma: PrismaService) {}

  async createTerminal(dto: CreateCashTerminalDto, user: AuthenticatedUser) {
    this.requirePermission(user, PERMISSIONS.CASH_TERMINALS_REASSIGN);
    try {
      return await this.prisma.cashTerminal.create({ data: {
        operationalLocationId: dto.operationalLocationId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        deviceId: dto.deviceId.trim(),
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('CASH_TERMINAL_ALREADY_EXISTS');
      throw error;
    }
  }

  async listTerminals(query: ListCashTerminalQueryDto, user: AuthenticatedUser) {
    const locationId = user.role === 'ADMIN' ? query.operationalLocationId : user.operationalLocationId;
    if (user.role !== 'ADMIN' && query.operationalLocationId && query.operationalLocationId !== user.operationalLocationId) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    if (user.role !== 'ADMIN' && !query.deviceId?.trim()) throw new BadRequestException('CASH_TERMINAL_DEVICE_REQUIRED');
    return this.prisma.cashTerminal.findMany({
      where: { ...(locationId ? { operationalLocationId: locationId } : {}), ...(query.deviceId?.trim() ? { deviceId: query.deviceId.trim() } : {}), ...(query.isActive === undefined ? {} : { isActive: query.isActive }) },
      orderBy: [{ operationalLocationId: 'asc' }, { code: 'asc' }],
    });
  }

  async updateTerminal(id: string, dto: UpdateCashTerminalDto, user: AuthenticatedUser) {
    this.requirePermission(user, PERMISSIONS.CASH_TERMINALS_REASSIGN);
    const terminal = await this.prisma.cashTerminal.findUnique({ where: { id }, select: { id: true } });
    if (!terminal) throw new NotFoundException('CASH_TERMINAL_NOT_FOUND');
    try {
      return await this.prisma.cashTerminal.update({ where: { id }, data: {
        ...(dto.code === undefined ? {} : { code: dto.code.trim() }),
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.deviceId === undefined ? {} : { deviceId: dto.deviceId.trim() }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('CASH_TERMINAL_ALREADY_EXISTS');
      throw error;
    }
  }

  async requestTerminalActivation(dto: RequestCashTerminalActivationDto, user: AuthenticatedUser) {
    const deviceId = dto.deviceId.trim();
    if (deviceId.startsWith('legacy:')) throw new BadRequestException('CASH_TERMINAL_DEVICE_INVALID');
    if (user.role !== 'ADMIN' && dto.operationalLocationId && dto.operationalLocationId !== user.operationalLocationId) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    const operationalLocationId = user.role === 'ADMIN' ? dto.operationalLocationId?.trim() || user.operationalLocationId : user.operationalLocationId;
    if (!operationalLocationId) throw new BadRequestException('OPERATIONAL_LOCATION_REQUIRED');
    const location = await this.prisma.operationalLocation.findUnique({ where: { id: operationalLocationId }, select: { id: true, isActive: true, type: true } });
    if (!location?.isActive) throw new BadRequestException('LOCATION_INACTIVE');
    if (!cashTerminalLocationTypes.has(location.type)) throw new BadRequestException('LOCATION_NOT_POINT_OF_SALE');

    const compactCode = Array.from({ length: 10 }, () => terminalActivationAlphabet[randomInt(terminalActivationAlphabet.length)]).join('');
    const activationCode = `${compactCode.slice(0, 5)}-${compactCode.slice(5)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + terminalActivationTtlMs);
    await this.prisma.$transaction(async (tx) => {
      await tx.cashTerminalActivation.updateMany({ where: { deviceId, consumedAt: null }, data: { consumedAt: now } });
      await tx.cashTerminalActivation.create({ data: {
        operationalLocationId,
        requestedByUserId: user.id,
        deviceId,
        codeHash: this.hash(compactCode),
        expiresAt,
      } });
    });
    return { activationCode, expiresAt, operationalLocationId, deviceId };
  }

  async activateMigratedTerminal(id: string, dto: ActivateMigratedCashTerminalDto, user: AuthenticatedUser) {
    this.requirePermission(user, PERMISSIONS.CASH_TERMINALS_REASSIGN);
    const compactCode = dto.activationCode.toUpperCase().replace(/[-\s]/g, '');
    if (!/^[A-Z2-9]{10}$/.test(compactCode)) throw new BadRequestException('CASH_TERMINAL_ACTIVATION_INVALID');
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const terminal = await tx.cashTerminal.findUnique({ where: { id }, select: { id: true, operationalLocationId: true, deviceId: true } });
        if (!terminal) throw new NotFoundException('CASH_TERMINAL_NOT_FOUND');
        if (!terminal.deviceId.startsWith('legacy:')) throw new ConflictException('CASH_TERMINAL_ALREADY_BOUND');
        const activation = await tx.cashTerminalActivation.findUnique({ where: { codeHash: this.hash(compactCode) } });
        if (!activation || activation.consumedAt || activation.expiresAt <= now || activation.operationalLocationId !== terminal.operationalLocationId) {
          throw new BadRequestException('CASH_TERMINAL_ACTIVATION_INVALID');
        }
        const claim = await tx.cashTerminalActivation.updateMany({
          where: { id: activation.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now, consumedByUserId: user.id, cashTerminalId: terminal.id },
        });
        if (claim.count !== 1) throw new ConflictException('CASH_TERMINAL_ACTIVATION_ALREADY_USED');
        return tx.cashTerminal.update({ where: { id: terminal.id }, data: { deviceId: activation.deviceId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('CASH_TERMINAL_DEVICE_ALREADY_REGISTERED');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('CASH_TERMINAL_ACTIVATION_ALREADY_USED');
      throw error;
    }
  }

  async currentShift(deviceId: string, user: AuthenticatedUser) {
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
    const terminal = await this.prisma.cashTerminal.findUnique({
      where: { id: dto.terminalId },
      include: { operationalLocation: { select: { isActive: true, type: true } } },
    });
    if (!terminal?.isActive) throw new NotFoundException('CASH_TERMINAL_NOT_FOUND');
    if (!terminal.operationalLocation.isActive) throw new BadRequestException('LOCATION_INACTIVE');
    if (!cashTerminalLocationTypes.has(terminal.operationalLocation.type)) throw new BadRequestException('LOCATION_NOT_POINT_OF_SALE');
    if (terminal.deviceId !== dto.deviceId.trim()) throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
    if (user.role !== 'ADMIN' && terminal.operationalLocationId !== user.operationalLocationId) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');

    const businessDate = this.date(dto.businessDate);
    if (businessDate > this.date(this.currentOperationalDate())) throw new BadRequestException('DAILY_CLOSE_FUTURE_DATE');
    const initialCashFund = this.money(dto.initialCashFund);
    const initialCashIn = this.money(dto.initialCashIn);
    const initialCashOut = this.money(dto.initialCashOut);
    if (initialCashOut > initialCashFund + initialCashIn) throw new BadRequestException('INITIAL_CASH_OUT_EXCEEDS_AVAILABLE');
    const openedAt = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          `daily-close:${terminal.operationalLocationId}:${dto.businessDate.slice(0, 10)}`,
        );
        const existingDailyClose = await tx.pointOfSaleDailyClose.findFirst({
          where: { operationalLocationId: terminal.operationalLocationId, businessDate, status: { not: 'CANCELLED' } },
          select: { id: true, status: true },
        });
        if (existingDailyClose && existingDailyClose.status !== 'DRAFT') throw new BadRequestException('DAILY_CLOSE_NOT_EDITABLE');
        const dailyClose = existingDailyClose ?? await tx.pointOfSaleDailyClose.create({ data: {
          operationalLocationId: terminal.operationalLocationId,
          businessDate,
          openedByUserId: user.id,
          terminalIdentifier: 'Consolidado de sucursal',
          initialCashFund: 0,
          initialCashIn: 0,
          initialCashOut: 0,
        }, select: { id: true, status: true } });

        const shift = await tx.cashShift.create({ data: {
          terminalId: terminal.id,
          operationalLocationId: terminal.operationalLocationId,
          pointOfSaleDailyCloseId: dailyClose.id,
          cashierUserId: user.id,
          businessDate,
          openedAt,
          initialCashFund,
          initialCashIn,
          initialCashOut,
          notes: dto.notes?.trim() || null,
        }, include: shiftInclude });

        if (initialCashIn > 0) await tx.cashMovement.create({ data: {
          operationalLocationId: terminal.operationalLocationId, pointOfSaleDailyCloseId: dailyClose.id, cashShiftId: shift.id,
          type: 'CASH_IN', movementChannel: 'CASH', amount: initialCashIn, reason: 'Depósito inicial de apertura',
          reference: terminal.code, isOpening: true, occurredAt: openedAt, userId: user.id,
          idempotencyKey: `${shift.id}:opening-cash-in`, idempotencyPayloadHash: this.hash(`${shift.id}:CASH_IN:${initialCashIn}`),
        } });
        if (initialCashOut > 0) await tx.cashMovement.create({ data: {
          operationalLocationId: terminal.operationalLocationId, pointOfSaleDailyCloseId: dailyClose.id, cashShiftId: shift.id,
          type: 'CASH_OUT', movementChannel: 'CASH', amount: initialCashOut, reason: 'Retiro inicial de apertura',
          reference: terminal.code, isOpening: true, occurredAt: openedAt, userId: user.id,
          idempotencyKey: `${shift.id}:opening-cash-out`, idempotencyPayloadHash: this.hash(`${shift.id}:CASH_OUT:${initialCashOut}`),
        } });
        return shift;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('CASH_SHIFT_ALREADY_OPEN');
      throw error;
    }
  }

  async closeShift(id: string, dto: CloseCashShiftDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.cashShift.findUnique({ where: { id }, include: { terminal: true } });
      if (!shift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
      if (shift.status !== CashShiftStatus.OPEN) throw new ConflictException('CASH_SHIFT_NOT_OPEN');
      if (shift.cashierUserId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH');
      if (shift.terminal.deviceId !== dto.deviceId.trim()) throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
      const closedAt = new Date();
      const transition = await tx.cashShift.updateMany({ where: { id, status: CashShiftStatus.OPEN }, data: { status: CashShiftStatus.CLOSED, closedAt, closedByUserId: user.id, version: { increment: 1 } } });
      if (transition.count !== 1) throw new ConflictException('CASH_SHIFT_NOT_OPEN');
      const [cashPayments, cashIn, cashOut, expenses] = await Promise.all([
        tx.payment.aggregate({ where: { cashShiftId: id, paymentMethod: 'CASH', status: 'APPLIED' }, _sum: { amount: true } }),
        tx.cashMovement.aggregate({ where: { cashShiftId: id, type: 'CASH_IN', isOpening: false }, _sum: { amount: true } }),
        tx.cashMovement.aggregate({ where: { cashShiftId: id, type: 'CASH_OUT', isOpening: false }, _sum: { amount: true } }),
        tx.cashMovement.aggregate({ where: { cashShiftId: id, type: 'EXPENSE' }, _sum: { amount: true } }),
      ]);
      const expected = this.money(shift.initialCashFund) + this.money(shift.initialCashIn) - this.money(shift.initialCashOut)
        + this.money(cashPayments._sum.amount) + this.money(cashIn._sum.amount) - this.money(cashOut._sum.amount) - this.money(expenses._sum.amount);
      const counted = this.money(dto.cashCountedTotal);
      return tx.cashShift.update({ where: { id }, data: { cashCountedTotal: counted, cashDifferenceTotal: this.money(counted - expected) }, include: shiftInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recordMovement(id: string, dto: CreateCashShiftMovementDto, user: AuthenticatedUser, idempotencyKey: string) {
    const amount = this.money(dto.amount);
    const reason = dto.reason.trim();
    const reference = dto.reference?.trim() || null;
    const payloadHash = this.hash(JSON.stringify({ cashShiftId: id, type: dto.type, amount, reason, reference, userId: user.id }));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const shift = await tx.cashShift.findUnique({ where: { id }, include: { terminal: true } });
        if (!shift) throw new NotFoundException('CASH_SHIFT_NOT_FOUND');
        if (shift.cashierUserId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('CASH_SHIFT_CASHIER_MISMATCH');
        if (shift.terminal.deviceId !== dto.deviceId.trim()) throw new BadRequestException('CASH_TERMINAL_DEVICE_MISMATCH');
        const existing = await tx.cashMovement.findUnique({ where: { idempotencyKey } });
        if (existing) {
          if (existing.idempotencyPayloadHash !== payloadHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return existing;
        }
        if (shift.status !== CashShiftStatus.OPEN) throw new ConflictException('CASH_SHIFT_NOT_OPEN');
        if (!['EXPENSE', 'CASH_IN', 'CASH_OUT'].includes(dto.type)) throw new BadRequestException('CASH_SHIFT_MOVEMENT_TYPE_INVALID');
        return tx.cashMovement.create({ data: {
          operationalLocationId: shift.operationalLocationId,
          pointOfSaleDailyCloseId: shift.pointOfSaleDailyCloseId,
          cashShiftId: shift.id,
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
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.cashMovement.findUnique({ where: { idempotencyKey } });
        if (existing) {
          if (existing.idempotencyPayloadHash !== payloadHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return existing;
        }
      }
      throw error;
    }
  }

  private date(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  private money(value: Prisma.Decimal | number | string | null | undefined) {
    const number = Number(value ?? 0);
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private requirePermission(user: AuthenticatedUser, permission: string) {
    if (!user.permissions?.includes(permission)) {
      throw new ForbiddenException('CASH_TERMINAL_PERMISSION_REQUIRED');
    }
  }

  private currentOperationalDate(now = new Date()) {
    const timeZone = process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
}
