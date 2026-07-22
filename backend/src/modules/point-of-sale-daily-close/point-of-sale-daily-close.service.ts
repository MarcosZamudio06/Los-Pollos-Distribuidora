import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationalLocationType, PaymentStatus, PointOfSaleDailyCloseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { calculateDailyCloseCost, calculateDailyCloseKilos } from './daily-close-calculations';
import { CreateExpenseDto, CreateScaleTicketDto, ListDailyCloseQueryDto, OpenDailyCloseDto, ReasonedDailyCloseDto, RecordCashCountDto, VersionedDailyCloseDto } from './dto';

const detailInclude = {
  operationalLocation: { select: { id: true, name: true, code: true, type: true } },
  cashMovements: { orderBy: { occurredAt: 'desc' as const } },
  scaleTicketReferences: { include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { capturedAt: 'desc' as const } },
  lines: { include: { product: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  sales: { include: { items: true } },
  payments: true,
  inventoryMovements: true,
} satisfies Prisma.PointOfSaleDailyCloseInclude;

const dailyCloseTransitions: Record<PointOfSaleDailyCloseStatus, readonly PointOfSaleDailyCloseStatus[]> = {
  DRAFT: ['REVIEWED', 'CANCELLED'],
  REVIEWED: ['CLOSED', 'DRAFT', 'CANCELLED'],
  CLOSED: ['DRAFT'],
  CANCELLED: [],
};

const dailyCloseLocationTypes = new Set<OperationalLocationType>([
  OperationalLocationType.BRANCH,
  OperationalLocationType.MIXED,
  OperationalLocationType.EXTERNAL_POINT_OF_SALE,
]);

const appliedPaymentWhere = { status: PaymentStatus.APPLIED } as const;

@Injectable()
export class PointOfSaleDailyCloseService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDailyCloseQueryDto, user: AuthenticatedUser) {
    const locationId = await this.locationScope(user);
    if (locationId && query.operationalLocationId && query.operationalLocationId !== locationId) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
    const closes = await this.prisma.pointOfSaleDailyClose.findMany({
      where: {
        ...(locationId ? { operationalLocationId: locationId } : query.operationalLocationId ? { operationalLocationId: query.operationalLocationId } : {}),
        ...(query.businessDate ? { businessDate: this.date(query.businessDate) } : {}),
      },
      include: { operationalLocation: { select: { id: true, name: true, code: true } } },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });
    return closes.map((close) => this.projectForRole(close, user));
  }

  async get(id: string, user: AuthenticatedUser) {
    return this.projectForRole(await this.requireCloseAccess(id, user), user);
  }

  private async findClose(id: string) {
    const close = await this.prisma.pointOfSaleDailyClose.findUnique({ where: { id }, include: detailInclude });
    if (!close) throw new NotFoundException('DAILY_CLOSE_NOT_FOUND');
    return close;
  }

  async open(dto: OpenDailyCloseDto, user: AuthenticatedUser) {
    const location = await this.prisma.operationalLocation.findUnique({ where: { id: dto.operationalLocationId }, select: { id: true, isActive: true, type: true } });
    if (!location?.isActive) throw new BadRequestException('LOCATION_INACTIVE');
    if (!dailyCloseLocationTypes.has(location.type)) throw new BadRequestException('LOCATION_NOT_POINT_OF_SALE');
    await this.assertLocationAccess(dto.operationalLocationId, user);
    const businessDate = this.date(dto.businessDate);
    if (businessDate > this.date(this.currentOperationalDate())) throw new BadRequestException('DAILY_CLOSE_FUTURE_DATE');
    const duplicate = await this.prisma.pointOfSaleDailyClose.findFirst({
      where: { operationalLocationId: dto.operationalLocationId, businessDate, status: { not: 'CANCELLED' } }, select: { id: true },
    });
    if (duplicate) throw new ConflictException('DAILY_CLOSE_ALREADY_EXISTS');
    const { from, to } = this.operationalDay(businessDate);
    let created: { id: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const close = await tx.pointOfSaleDailyClose.create({ data: { operationalLocationId: dto.operationalLocationId, businessDate, openedByUserId: user.id, notes: dto.notes?.trim() || null } });
        await this.syncOperations(tx, close.id, dto.operationalLocationId, from, to);
        return close;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('DAILY_CLOSE_ALREADY_EXISTS');
      }
      throw error;
    }
    return this.projectForRole(await this.recalculate(created.id), user);
  }

  async addExpense(id: string, dto: CreateExpenseDto, user: AuthenticatedUser) {
    const close = await this.requireDraft(id, user);
    if (!dto.reason.trim()) throw new BadRequestException('EXPENSE_REASON_REQUIRED');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const { from, to } = this.operationalDay(close.businessDate);
    if (occurredAt < from || occurredAt >= to) throw new BadRequestException('EXPENSE_OUTSIDE_OPERATIONAL_DAY');
    await this.prisma.cashMovement.create({ data: {
      operationalLocationId: close.operationalLocationId, pointOfSaleDailyCloseId: id, type: 'EXPENSE', movementChannel: 'CASH',
      amount: dto.amount, reason: dto.reason.trim(), reference: dto.reference?.trim() || null, occurredAt, userId: user.id,
    }});
    await this.bump(id);
    return this.projectForRole(await this.recalculate(id), user);
  }

  async addScaleTicket(id: string, dto: CreateScaleTicketDto, user: AuthenticatedUser) {
    const close = await this.requireDraft(id, user);
    if (dto.weightKg === undefined && dto.pieceCount === undefined && dto.amount === undefined) throw new BadRequestException('SCALE_TICKET_QUANTITY_REQUIRED');
    const capturedDate = this.date(dto.capturedDate);
    if (capturedDate.getTime() !== close.businessDate.getTime()) throw new BadRequestException('SCALE_TICKET_DATE_MISMATCH');
    try {
      await this.prisma.scaleTicketReference.create({ data: {
        operationalLocationId: close.operationalLocationId, pointOfSaleDailyCloseId: id, physicalFolio: dto.physicalFolio.trim(), capturedDate,
        productId: dto.productId || null, weightKg: dto.weightKg, pieceCount: dto.pieceCount, unitPrice: dto.unitPrice, amount: dto.amount,
        capturedByUserId: user.id, capturedAt: new Date(), notes: dto.notes?.trim() || null,
      }});
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('SCALE_TICKET_ALREADY_EXISTS');
      throw error;
    }
    await this.bump(id);
    return this.projectForRole(await this.recalculate(id), user);
  }

  async recordCashCount(id: string, dto: RecordCashCountDto, user: AuthenticatedUser) {
    await this.requireDraft(id, user);
    await this.prisma.pointOfSaleDailyClose.update({
      where: { id },
      data: { cashCountedTotal: dto.cashCountedTotal, version: { increment: 1 }, lastValidatedAt: null, validatedSourceVersion: null },
    });
    return this.projectForRole(await this.recalculate(id), user);
  }

  async validate(id: string, user: AuthenticatedUser) {
    const close = await this.requireDraft(id, user);
    const updated = await this.recalculate(id);
    const errors: Array<{ code: string; message: string }> = [];
    if (updated.lines.some((line) => line.operationalLocationId !== close.operationalLocationId)) errors.push({ code: 'OPERATION_LOCATION_MISMATCH', message: 'Hay operaciones de otra ubicación.' });
    if (updated.cashCountedTotal === null) errors.push({ code: 'CASH_COUNT_REQUIRED', message: 'Registra el efectivo contado antes de validar el cierre.' });
    const differences = [
      { code: 'SCALE_DIFFERENCE', value: Number(updated.scaleDifferenceKg), unit: 'kg' },
      { code: 'CASH_DIFFERENCE', value: Number(updated.cashDifferenceTotal), unit: 'MXN' },
    ].filter((item) => item.value !== 0);
    const attemptedAt = new Date();
    const validated = await this.prisma.pointOfSaleDailyClose.update({
      where: { id },
      data: errors.length === 0
        ? { lastValidationAttemptAt: attemptedAt, lastValidatedAt: attemptedAt, validatedSourceVersion: updated.version }
        : { lastValidationAttemptAt: attemptedAt, lastValidatedAt: null, validatedSourceVersion: null },
      include: detailInclude,
    });
    return {
      close: this.projectForRole(validated, user),
      valid: errors.length === 0,
      errors,
      differences: user.role === 'WAREHOUSE' ? differences.filter((item) => item.unit === 'kg') : user.role === 'COLLECTIONS' ? differences.filter((item) => item.unit === 'MXN') : differences,
    };
  }

  async review(id: string, dto: VersionedDailyCloseDto, user: AuthenticatedUser) {
    this.admin(user);
    const validation = await this.validate(id, user);
    if (!validation.valid) throw new BadRequestException({ message: 'DAILY_CLOSE_VALIDATION_FAILED', errors: validation.errors });
    return this.transition(id, dto.version, 'REVIEWED', { status: 'REVIEWED', reviewedByUserId: user.id, reviewedAt: new Date(), validatedSourceVersion: dto.version + 1 }, user);
  }

  async close(id: string, dto: VersionedDailyCloseDto, user: AuthenticatedUser) {
    this.admin(user);
    const current = await this.requireCloseAccess(id, user);
    if (current.validatedSourceVersion !== current.version) throw new ConflictException('DAILY_CLOSE_REVALIDATION_REQUIRED');
    return this.transition(id, dto.version, 'CLOSED', { status: 'CLOSED', closedByUserId: user.id, closedAt: new Date() }, user);
  }

  async cancel(id: string, dto: ReasonedDailyCloseDto, user: AuthenticatedUser) {
    this.admin(user);
    return this.transition(id, dto.version, 'CANCELLED', { status: 'CANCELLED', cancelledByUserId: user.id, cancelledAt: new Date(), notes: `Cancelación: ${dto.reason.trim()}` }, user);
  }

  async reopen(id: string, dto: ReasonedDailyCloseDto, user: AuthenticatedUser) {
    this.admin(user);
    return this.transition(id, dto.version, 'DRAFT', { status: 'DRAFT', reopenedByUserId: user.id, reopenedAt: new Date(), reopenedReason: dto.reason.trim(), lastValidatedAt: null, validatedSourceVersion: null }, user);
  }

  async refresh(id: string, user: AuthenticatedUser) {
    await this.requireDraft(id, user);
    return this.projectForRole(await this.recalculate(id), user);
  }

  private async recalculate(id: string) {
    let close = await this.findClose(id);
    if (close.status !== 'DRAFT') return this.withCostQuality(close);
    const { from, to } = this.operationalDay(close.businessDate);
    await this.prisma.$transaction((tx) => this.syncOperations(tx, close.id, close.operationalLocationId, from, to));
    close = await this.findClose(id);
    const sum = (values: Array<Prisma.Decimal | null>, fallback = 0) => values.reduce<number>((total, value) => total + Number(value ?? fallback), 0);
    const byConcept = (concept: string, field: 'quantityKg' | 'amount') => sum(close.lines.filter((line) => line.conceptType === concept).map((line) => line[field] as Prisma.Decimal | null));
    const scaleReportedKg = sum(close.scaleTicketReferences.map((ticket) => ticket.weightKg));
    const kilos = calculateDailyCloseKilos({
      inventoryMovements: close.inventoryMovements,
      manualInputKg: byConcept('PRODUCT_RECEIVED', 'quantityKg'),
      manualSoldKg: byConcept('SALE_NOTE', 'quantityKg') + byConcept('SALE_SCALE_TICKET', 'quantityKg'),
      sales: close.sales,
    });
    const expenseTotal = sum(close.cashMovements.filter((movement) => movement.type === 'EXPENSE').map((movement) => movement.amount));
    const grossSalesTotal = sum(close.sales.map((sale) => sale.total));
    const appliedPayments = close.payments.filter((payment) => payment.status === PaymentStatus.APPLIED);
    const cashTotal = sum(appliedPayments.filter((payment) => payment.paymentMethod === 'CASH').map((payment) => payment.amount));
    const cardVoucherTotal = sum(appliedPayments.filter((payment) => payment.paymentMethod === 'CARD' || payment.paymentMethod === 'VOUCHER').map((payment) => payment.amount));
    const transferTotal = sum(appliedPayments.filter((payment) => payment.paymentMethod === 'TRANSFER' || payment.paymentMethod === 'DEPOSIT').map((payment) => payment.amount));
    const { purchaseCostTotal, costQuality } = calculateDailyCloseCost(close.sales);
    const cashExpenseTotal = sum(close.cashMovements.filter((movement) => movement.type === 'EXPENSE' && movement.movementChannel === 'CASH').map((movement) => movement.amount));
    const data = {
      totalInputKg: kilos.totalInputKg, totalSoldKg: kilos.totalSoldKg, totalRemainingKg: byConcept('REMAINING_STOCK', 'quantityKg'), totalShortageKg: byConcept('SHORTAGE', 'quantityKg'), totalSurplusKg: byConcept('SURPLUS', 'quantityKg'),
      scaleReportedKg, scaleDifferenceKg: scaleReportedKg - kilos.totalSoldKg, cashTotal, cardVoucherTotal, transferTotal,
      expenseTotal, grossSalesTotal, netCashExpected: cashTotal - cashExpenseTotal,
      cashDifferenceTotal: close.cashCountedTotal === null ? null : Number(close.cashCountedTotal) - (cashTotal - cashExpenseTotal),
      purchaseCostTotal, grossProfitTotal: grossSalesTotal - purchaseCostTotal, netProfitTotal: grossSalesTotal - purchaseCostTotal - expenseTotal,
    };
    const updated = await this.prisma.pointOfSaleDailyClose.update({ where: { id }, data, include: detailInclude });
    return { ...updated, costQuality, dataAsOf: updated.updatedAt };
  }

  private async requireDraft(id: string, user: AuthenticatedUser) { const close = await this.requireCloseAccess(id, user); if (close.status !== 'DRAFT') throw new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'); return close; }
  private async syncOperations(tx: Prisma.TransactionClient, closeId: string, locationId: string, from: Date, to: Date) {
    await tx.sale.updateMany({ where: { pointOfSaleDailyCloseId: closeId, NOT: { locationId, createdAt: { gte: from, lt: to }, status: 'CONFIRMED' } }, data: { pointOfSaleDailyCloseId: null } });
    await tx.payment.updateMany({ where: { pointOfSaleDailyCloseId: closeId, NOT: { operationalLocationId: locationId, paidAt: { gte: from, lt: to }, ...appliedPaymentWhere, routeId: null } }, data: { pointOfSaleDailyCloseId: null } });
    await tx.sale.updateMany({ where: { locationId, createdAt: { gte: from, lt: to }, status: 'CONFIRMED' }, data: { pointOfSaleDailyCloseId: closeId } });
    await tx.payment.updateMany({ where: { operationalLocationId: locationId, paidAt: { gte: from, lt: to }, ...appliedPaymentWhere, routeId: null, pointOfSaleDailyCloseId: null }, data: { pointOfSaleDailyCloseId: closeId } });
    await tx.inventoryMovement.updateMany({ where: { locationId, createdAt: { gte: from, lt: to }, type: { in: ['IN', 'PURCHASE', 'TRANSFER_IN'] }, pointOfSaleDailyCloseId: null }, data: { pointOfSaleDailyCloseId: closeId } });
  }
  private async bump(id: string) { await this.prisma.pointOfSaleDailyClose.update({ where: { id }, data: { version: { increment: 1 }, lastValidatedAt: null, validatedSourceVersion: null } }); }
  private async transition(id: string, version: number, target: PointOfSaleDailyCloseStatus, data: Prisma.PointOfSaleDailyCloseUncheckedUpdateInput, user: AuthenticatedUser) {
    const current = await this.findClose(id);
    if (!dailyCloseTransitions[current.status].includes(target)) throw new BadRequestException('DAILY_CLOSE_INVALID_STATUS');
    const result = await this.prisma.pointOfSaleDailyClose.updateMany({ where: { id, version, status: current.status }, data: { ...data, version: { increment: 1 } } });
    if (!result.count) throw new ConflictException('DAILY_CLOSE_VERSION_CONFLICT');
    return this.get(id, user);
  }
  private async locationScope(user: AuthenticatedUser): Promise<string | null> {
    if (user.role === 'ADMIN') return null;
    const actor = await this.prisma.user.findUnique({ where: { id: user.id }, select: { operationalLocationId: true, isActive: true } });
    if (!actor?.isActive || !actor.operationalLocationId) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    return actor.operationalLocationId;
  }
  private async assertLocationAccess(locationId: string, user: AuthenticatedUser) {
    const allowedLocationId = await this.locationScope(user);
    if (allowedLocationId && allowedLocationId !== locationId) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
  }
  private async requireCloseAccess(id: string, user: AuthenticatedUser) {
    const close = await this.findClose(id);
    await this.assertLocationAccess(close.operationalLocationId, user);
    return close;
  }
  private projectForRole(close: object, user: AuthenticatedUser) {
    const candidate = close as { sales?: Array<{ items: Array<{ costSnapshotSource: 'SALE_CONFIRMATION' | 'LEGACY_BACKFILL' }> }>; updatedAt: Date };
    const result = { ...(Array.isArray(candidate.sales) ? this.withCostQuality(candidate as { sales: Array<{ items: Array<{ costSnapshotSource: 'SALE_CONFIRMATION' | 'LEGACY_BACKFILL' }> }>; updatedAt: Date }) : candidate) } as Record<string, unknown>;
    if (user.role === 'WAREHOUSE') {
      ['payments', 'cashMovements', 'sales', 'cashTotal', 'cardVoucherTotal', 'transferTotal', 'expenseTotal', 'grossSalesTotal', 'netCashExpected', 'cashCountedTotal', 'cashDifferenceTotal', 'purchaseCostTotal', 'grossProfitTotal', 'netProfitTotal', 'costQuality'].forEach((field) => delete result[field]);
      if (Array.isArray(result.lines)) result.lines = result.lines.map(({ amount, ...line }) => line);
      if (Array.isArray(result.scaleTicketReferences)) result.scaleTicketReferences = result.scaleTicketReferences.map(({ amount, unitPrice, ...ticket }) => ticket);
    }
    if (user.role === 'COLLECTIONS') {
      ['inventoryMovements', 'lines', 'scaleTicketReferences', 'totalInputKg', 'totalSoldKg', 'totalRemainingKg', 'totalShortageKg', 'totalSurplusKg', 'scaleReportedKg', 'scaleDifferenceKg', 'purchaseCostTotal', 'grossProfitTotal', 'netProfitTotal', 'costQuality'].forEach((field) => delete result[field]);
      if (Array.isArray(result.sales)) result.sales = result.sales.map(({ items, ...sale }) => sale);
    }
    return result;
  }
  private admin(user: AuthenticatedUser) { if (user.role !== 'ADMIN') throw new ForbiddenException('DAILY_CLOSE_ADMIN_REQUIRED'); }
  private date(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`); if (Number.isNaN(date.getTime())) throw new BadRequestException('INVALID_BUSINESS_DATE'); return date; }
  private currentOperationalDate(now = new Date()) {
    const timeZone = process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  private operationalDay(businessDate: Date) {
    const from = new Date(Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth(), businessDate.getUTCDate(), 6));
    return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
  }
  private withCostQuality<T extends { sales: Array<{ items: Array<{ costSnapshotSource: 'SALE_CONFIRMATION' | 'LEGACY_BACKFILL' }> }>; updatedAt: Date }>(close: T) {
    const estimated = close.sales.some((sale) => sale.items.some((item) => item.costSnapshotSource === 'LEGACY_BACKFILL'));
    return { ...close, costQuality: estimated ? 'ESTIMATED' as const : 'EXACT' as const, dataAsOf: close.updatedAt };
  }
}
