import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DailyCloseEventType, DailyCloseSnapshotType, OperationalLocationType, PaymentStatus, PointOfSaleDailyCloseStatus, Prisma, SaleDocumentType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { calculateDailyCloseCost, calculateDailyCloseKilos } from './daily-close-calculations';
import { CreateDailyCloseInventoryCountDto, CreateExpenseDto, CreateScaleTicketDto, ListDailyCloseQueryDto, OpenDailyCloseDto, ReasonedDailyCloseDto, RecordCashCountDto, UpdateDailyCloseInventoryCountDto, VersionedDailyCloseDto } from './dto';

const detailInclude = {
  operationalLocation: { select: { id: true, name: true, code: true, type: true } },
  cashMovements: { orderBy: { occurredAt: 'desc' as const } },
  scaleTicketReferences: { include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { capturedAt: 'desc' as const } },
  inventoryCounts: { include: { product: { select: { id: true, name: true, sku: true, unit: true } }, countedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  lines: { include: { product: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  sales: {
    include: {
      billingRequests: { include: { customer: { select: { id: true, name: true, taxId: true } } } },
      customer: { select: { id: true, name: true, taxId: true } },
      documents: true,
      items: true,
    },
  },
  payments: true,
  inventoryMovements: { include: { product: { select: { id: true, name: true, sku: true } } } },
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
const decreaseMovementTypes = new Set(['OUT', 'SALE', 'CANCEL_PURCHASE', 'TRANSFER_OUT', 'SHRINKAGE']);
type DailyCloseClient = Prisma.TransactionClient | PrismaService;

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
    return this.projectDetailForRole(await this.requireCloseAccess(id, user), user);
  }

  private async findClose(id: string, client: DailyCloseClient = this.prisma) {
    const close = await client.pointOfSaleDailyClose.findUnique({ where: { id }, include: detailInclude });
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
        return this.recalculate(close.id, tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('DAILY_CLOSE_ALREADY_EXISTS');
      }
      throw error;
    }
    return this.projectForRole(created, user);
  }

  async addExpense(id: string, dto: CreateExpenseDto, user: AuthenticatedUser, idempotencyKey: string) {
    const close = await this.requireDraft(id, user);
    if (!dto.reason.trim()) throw new BadRequestException('EXPENSE_REASON_REQUIRED');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const { from, to } = this.operationalDay(close.businessDate);
    if (occurredAt < from || occurredAt >= to) throw new BadRequestException('EXPENSE_OUTSIDE_OPERATIONAL_DAY');
    const payloadHash = this.hashPayload({ closeId: id, amount: dto.amount, reason: dto.reason.trim(), reference: dto.reference?.trim() || null, occurredAt: occurredAt.toISOString(), userId: user.id });
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.cashMovement.findUnique({ where: { idempotencyKey } });
        if (existing) {
          this.assertSameIdempotencyPayload(existing.idempotencyPayloadHash, payloadHash);
          return this.findClose(id, tx);
        }
        const movement = await tx.cashMovement.create({ data: {
          operationalLocationId: close.operationalLocationId, pointOfSaleDailyCloseId: id, type: 'EXPENSE', movementChannel: 'CASH',
          amount: dto.amount, reason: dto.reason.trim(), reference: dto.reference?.trim() || null, occurredAt, userId: user.id,
          idempotencyKey, idempotencyPayloadHash: payloadHash,
        }});
        await this.bump(tx, id);
        const recalculated = await this.recalculate(id, tx);
        await this.createEvent(tx, id, DailyCloseEventType.EXPENSE_RECORDED, user.id, { cashMovementId: movement.id, payloadHash }, idempotencyKey);
        return recalculated;
      });
      return this.projectForRole(updated, user);
    } catch (error) {
      if (this.isIdempotencyRaceError(error)) return this.resolveExpenseReplay(id, idempotencyKey, payloadHash, user);
      throw error;
    }
  }

  async addScaleTicket(id: string, dto: CreateScaleTicketDto, user: AuthenticatedUser, idempotencyKey: string) {
    const close = await this.requireDraft(id, user);
    const netWeightKg = dto.netWeightKg ?? dto.weightKg;
    if (netWeightKg === undefined && dto.pieceCount === undefined && dto.amount === undefined) throw new BadRequestException('SCALE_TICKET_QUANTITY_REQUIRED');
    const capturedDate = this.date(dto.capturedDate);
    if (capturedDate.getTime() !== close.businessDate.getTime()) throw new BadRequestException('SCALE_TICKET_DATE_MISMATCH');
    let saleId = dto.saleId?.trim() || null;
    let saleDocumentId = dto.saleDocumentId?.trim() || null;

    if (saleDocumentId) {
      const saleDocument = await this.prisma.saleDocument.findFirst({
        where: {
          id: saleDocumentId,
          operationalLocationId: close.operationalLocationId,
          documentType: SaleDocumentType.SCALE_TICKET,
        },
        select: { id: true, saleId: true },
      });
      if (!saleDocument) throw new BadRequestException('SCALE_TICKET_DOCUMENT_NOT_FOUND');
      if (saleId && saleId !== saleDocument.saleId) throw new BadRequestException('SCALE_TICKET_SALE_DOCUMENT_MISMATCH');
      saleId = saleDocument.saleId;
    }

    if (saleId) {
      const sale = await this.prisma.sale.findFirst({
        where: {
          id: saleId,
          locationId: close.operationalLocationId,
          documentType: SaleDocumentType.SCALE_TICKET,
        },
        select: { id: true },
      });
      if (!sale) throw new BadRequestException('SCALE_TICKET_SALE_NOT_FOUND');
    }

    const payloadHash = this.hashPayload({ closeId: id, physicalFolio: dto.physicalFolio.trim(), capturedDate: capturedDate.toISOString(), saleId, saleDocumentId, productId: dto.productId || null, weightKg: netWeightKg ?? null, grossWeightKg: dto.grossWeightKg ?? null, tareWeightKg: dto.tareWeightKg ?? null, pieceCount: dto.pieceCount ?? null, unitPrice: dto.unitPrice ?? null, amount: dto.amount ?? null, scaleDeviceId: dto.scaleDeviceId?.trim() || null, notes: dto.notes?.trim() || null, userId: user.id });
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.scaleTicketReference.findUnique({ where: { idempotencyKey } });
        if (existing) {
          this.assertSameIdempotencyPayload(existing.idempotencyPayloadHash, payloadHash);
          return this.findClose(id, tx);
        }
        const ticket = await tx.scaleTicketReference.create({ data: {
          operationalLocationId: close.operationalLocationId, pointOfSaleDailyCloseId: id, physicalFolio: dto.physicalFolio.trim(), capturedDate,
          saleId, saleDocumentId, productId: dto.productId || null, weightKg: netWeightKg,
          grossWeightKg: dto.grossWeightKg, tareWeightKg: dto.tareWeightKg, netWeightKg,
          pieceCount: dto.pieceCount, unitPrice: dto.unitPrice, amount: dto.amount,
          scaleDeviceId: dto.scaleDeviceId?.trim() || null, captureSource: 'MANUAL',
          capturedByUserId: user.id, capturedAt: new Date(), notes: dto.notes?.trim() || null,
          idempotencyKey, idempotencyPayloadHash: payloadHash,
        }});
        await this.bump(tx, id);
        const recalculated = await this.recalculate(id, tx);
        await this.createEvent(tx, id, DailyCloseEventType.SCALE_TICKET_RECORDED, user.id, { scaleTicketReferenceId: ticket.id, payloadHash }, idempotencyKey);
        return recalculated;
      });
      return this.projectForRole(updated, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.scaleTicketReference.findUnique({ where: { idempotencyKey } });
        if (existing) return this.resolveScaleTicketReplay(id, idempotencyKey, payloadHash, user);
        throw new ConflictException('SCALE_TICKET_ALREADY_EXISTS');
      }
      if (this.isIdempotencyRaceError(error)) return this.resolveScaleTicketReplay(id, idempotencyKey, payloadHash, user);
      throw error;
    }
  }

  async recordCashCount(id: string, dto: RecordCashCountDto, user: AuthenticatedUser) {
    await this.requireDraft(id, user);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.pointOfSaleDailyClose.update({
        where: { id },
        data: { cashCountedTotal: dto.cashCountedTotal, version: { increment: 1 }, lastValidatedAt: null, validatedSourceVersion: null },
      });
      const recalculated = await this.recalculate(id, tx);
      await this.createEvent(tx, id, DailyCloseEventType.CASH_COUNT_RECORDED, user.id, { cashCountedTotal: dto.cashCountedTotal });
      return recalculated;
    });
    return this.projectForRole(updated, user);
  }

  async getReconciliation(id: string, user: AuthenticatedUser) {
    let close = await this.requireCloseAccess(id, user);
    if (close.status === 'DRAFT') close = await this.prisma.$transaction((tx) => this.recalculate(id, tx));
    return this.reconciliationForClose(close);
  }

  async createInventoryCount(id: string, dto: CreateDailyCloseInventoryCountDto, user: AuthenticatedUser, idempotencyKey: string) {
    await this.requireDraft(id, user);
    this.assertCountQuantities(dto.physicalQuantityKg, dto.physicalQuantityPieces);
    if (!dto.reason.trim()) throw new BadRequestException('DAILY_CLOSE_INVENTORY_COUNT_REASON_REQUIRED');
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, select: { id: true, unit: true } });
    if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');
    this.assertProductCountUnit(product.unit, dto.physicalQuantityKg, dto.physicalQuantityPieces);
    const payloadHash = this.hashPayload({ closeId: id, productId: dto.productId, physicalQuantityKg: dto.physicalQuantityKg ?? 0, physicalQuantityPieces: dto.physicalQuantityPieces ?? 0, reason: dto.reason.trim(), userId: user.id });
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.dailyCloseInventoryCount.findUnique({ where: { idempotencyKey } });
        if (existing) {
          this.assertSameIdempotencyPayload(existing.idempotencyPayloadHash, payloadHash);
          return this.findClose(id, tx);
        }
        const count = await tx.dailyCloseInventoryCount.create({ data: {
          pointOfSaleDailyCloseId: id,
          productId: dto.productId,
          physicalQuantityKg: dto.physicalQuantityKg ?? 0,
          physicalQuantityPieces: dto.physicalQuantityPieces ?? 0,
          reason: dto.reason.trim(),
          countedByUserId: user.id,
          idempotencyKey, idempotencyPayloadHash: payloadHash,
        }});
        await this.bump(tx, id);
        const recalculated = await this.recalculate(id, tx);
        await this.createEvent(tx, id, DailyCloseEventType.INVENTORY_COUNT_CREATED, user.id, { inventoryCountId: count.id, payloadHash }, idempotencyKey);
        return recalculated;
      });
      return this.projectForRole(updated, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.dailyCloseInventoryCount.findUnique({ where: { idempotencyKey } });
        if (existing) return this.resolveInventoryCountReplay(id, idempotencyKey, payloadHash, user);
        throw new ConflictException('DAILY_CLOSE_INVENTORY_COUNT_ALREADY_EXISTS');
      }
      if (this.isIdempotencyRaceError(error)) return this.resolveInventoryCountReplay(id, idempotencyKey, payloadHash, user);
      throw error;
    }
  }

  async updateInventoryCount(id: string, countId: string, dto: UpdateDailyCloseInventoryCountDto, user: AuthenticatedUser) {
    await this.requireDraft(id, user);
    if (dto.physicalQuantityKg === undefined && dto.physicalQuantityPieces === undefined && dto.reason === undefined) throw new BadRequestException('DAILY_CLOSE_INVENTORY_COUNT_UPDATE_REQUIRED');
    this.assertCountQuantities(dto.physicalQuantityKg, dto.physicalQuantityPieces, true);
    if (dto.reason !== undefined && !dto.reason.trim()) throw new BadRequestException('DAILY_CLOSE_INVENTORY_COUNT_REASON_REQUIRED');
    const count = await this.prisma.dailyCloseInventoryCount.findFirst({ where: { id: countId, pointOfSaleDailyCloseId: id }, select: { id: true, product: { select: { unit: true } } } });
    if (!count) throw new NotFoundException('DAILY_CLOSE_INVENTORY_COUNT_NOT_FOUND');
    this.assertProductCountUnit(count.product.unit, dto.physicalQuantityKg, dto.physicalQuantityPieces, true);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.dailyCloseInventoryCount.update({ where: { id: countId }, data: {
        ...(dto.physicalQuantityKg === undefined ? {} : { physicalQuantityKg: dto.physicalQuantityKg }),
        ...(dto.physicalQuantityPieces === undefined ? {} : { physicalQuantityPieces: dto.physicalQuantityPieces }),
        ...(dto.reason === undefined ? {} : { reason: dto.reason.trim() }),
        countedByUserId: user.id,
      }});
      await this.bump(tx, id);
      const recalculated = await this.recalculate(id, tx);
      await this.createEvent(tx, id, DailyCloseEventType.INVENTORY_COUNT_UPDATED, user.id, { inventoryCountId: countId });
      return recalculated;
    });
    return this.projectForRole(updated, user);
  }

  async deleteInventoryCount(id: string, countId: string, user: AuthenticatedUser) {
    await this.requireDraft(id, user);
    const count = await this.prisma.dailyCloseInventoryCount.findFirst({ where: { id: countId, pointOfSaleDailyCloseId: id }, select: { id: true } });
    if (!count) throw new NotFoundException('DAILY_CLOSE_INVENTORY_COUNT_NOT_FOUND');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.dailyCloseInventoryCount.delete({ where: { id: countId } });
      await this.bump(tx, id);
      const recalculated = await this.recalculate(id, tx);
      await this.createEvent(tx, id, DailyCloseEventType.INVENTORY_COUNT_DELETED, user.id, { inventoryCountId: countId });
      return recalculated;
    });
    return this.projectForRole(updated, user);
  }

  async validate(id: string, user: AuthenticatedUser) {
    await this.requireDraft(id, user);
    const result = await this.prisma.$transaction((tx) => this.validateWithin(id, user, tx));
    return {
      ...result,
      close: await this.projectDetailForRole(result.close, user),
    };
  }

  private async validateWithin(id: string, user: AuthenticatedUser, tx: Prisma.TransactionClient) {
    const close = await this.findClose(id, tx);
    if (close.status !== 'DRAFT') throw new BadRequestException('DAILY_CLOSE_NOT_EDITABLE');
    const updated = await this.recalculate(id, tx);
    const errors: Array<{ code: string; message: string }> = [];
    if (updated.lines.some((line) => line.operationalLocationId !== close.operationalLocationId)) errors.push({ code: 'OPERATION_LOCATION_MISMATCH', message: 'Hay operaciones de otra ubicación.' });
    if (updated.cashCountedTotal === null) errors.push({ code: 'CASH_COUNT_REQUIRED', message: 'Registra el efectivo contado antes de validar el cierre.' });
    const differences = [
      { code: 'SCALE_DIFFERENCE', value: Number(updated.scaleDifferenceKg), unit: 'kg' },
      { code: 'CASH_DIFFERENCE', value: Number(updated.cashDifferenceTotal), unit: 'MXN' },
    ].filter((item) => item.value !== 0);
    const attemptedAt = new Date();
    const validated = await tx.pointOfSaleDailyClose.update({
      where: { id },
      data: errors.length === 0
        ? { lastValidationAttemptAt: attemptedAt, lastValidatedAt: attemptedAt, validatedSourceVersion: updated.version }
        : { lastValidationAttemptAt: attemptedAt, lastValidatedAt: null, validatedSourceVersion: null },
      include: detailInclude,
    });
    return {
      close: validated,
      valid: errors.length === 0,
      errors,
      differences: user.role === 'WAREHOUSE' ? differences.filter((item) => item.unit === 'kg') : user.role === 'COLLECTIONS' ? differences.filter((item) => item.unit === 'MXN') : differences,
    };
  }

  async review(id: string, dto: VersionedDailyCloseDto, user: AuthenticatedUser) {
    this.admin(user);
    await this.requireCloseAccess(id, user);
    const transitioned = await this.prisma.$transaction(async (tx) => {
      const validation = await this.validateWithin(id, user, tx);
      if (!validation.valid) throw new BadRequestException({ message: 'DAILY_CLOSE_VALIDATION_FAILED', errors: validation.errors });
      return this.transitionWithin(tx, id, dto.version, 'REVIEWED', { status: 'REVIEWED', reviewedByUserId: user.id, reviewedAt: new Date(), validatedSourceVersion: dto.version + 1 }, user);
    });
    return this.projectDetailForRole(transitioned, user);
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
    return this.projectDetailForRole(await this.prisma.$transaction((tx) => this.recalculate(id, tx)), user);
  }

  private async recalculate(id: string, client: DailyCloseClient = this.prisma) {
    let close = await this.findClose(id, client);
    if (close.status !== 'DRAFT') return this.withCostQuality(close);
    const { from, to } = this.operationalDay(close.businessDate);
    await this.syncOperations(client, close.id, close.operationalLocationId, from, to);
    close = await this.findClose(id, client);
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
    const reconciliation = await this.reconciliationForClose(close, client);
    const data = {
      totalInputKg: kilos.totalInputKg, totalSoldKg: kilos.totalSoldKg,
      totalRemainingKg: reconciliation.items.reduce((total, item) => total + item.theoreticalQuantityKg, 0),
      totalShortageKg: reconciliation.items.reduce((total, item) => total + item.shortageQuantityKg, 0),
      totalSurplusKg: reconciliation.items.reduce((total, item) => total + item.surplusQuantityKg, 0),
      scaleReportedKg, scaleDifferenceKg: scaleReportedKg - kilos.totalSoldKg, cashTotal, cardVoucherTotal, transferTotal,
      expenseTotal, grossSalesTotal, netCashExpected: cashTotal - cashExpenseTotal,
      cashDifferenceTotal: close.cashCountedTotal === null ? null : Number(close.cashCountedTotal) - (cashTotal - cashExpenseTotal),
      purchaseCostTotal, grossProfitTotal: grossSalesTotal - purchaseCostTotal, netProfitTotal: grossSalesTotal - purchaseCostTotal - expenseTotal,
    };
    const updated = await client.pointOfSaleDailyClose.update({ where: { id }, data, include: detailInclude });
    return { ...updated, costQuality, dataAsOf: updated.updatedAt };
  }

  private async reconciliationForClose(close: { id: string; operationalLocationId: string; businessDate: Date; sales: Array<{ items: Array<{ productId: string; quantityKg: Prisma.Decimal | null; quantityPieces: number | null }> }> }, client: DailyCloseClient = this.prisma) {
    const { from, to } = this.operationalDay(close.businessDate);
    const [movements, counts] = await Promise.all([
      client.inventoryMovement.findMany({
        where: { locationId: close.operationalLocationId, createdAt: { lt: to } },
        select: { productId: true, type: true, quantityKg: true, quantityPieces: true, previousQuantityKg: true, previousQuantityPieces: true, newQuantityKg: true, newQuantityPieces: true, createdAt: true, product: { select: { id: true, name: true, sku: true, unit: true } } },
      }),
      client.dailyCloseInventoryCount.findMany({
        where: { pointOfSaleDailyCloseId: close.id },
        include: { product: { select: { id: true, name: true, sku: true, unit: true } }, countedBy: { select: { id: true, name: true } } },
      }),
    ]);
    type Entry = { product: { id: string; name: string; sku: string | null; unit: string }; openingQuantityKg: number; openingQuantityPieces: number; entriesQuantityKg: number; entriesQuantityPieces: number; soldQuantityKg: number; soldQuantityPieces: number; otherOutputsQuantityKg: number; otherOutputsQuantityPieces: number; count?: typeof counts[number] };
    const entries = new Map<string, Entry>();
    const entryFor = (product: Entry['product']) => {
      const existing = entries.get(product.id);
      if (existing) return existing;
      const entry: Entry = { product, openingQuantityKg: 0, openingQuantityPieces: 0, entriesQuantityKg: 0, entriesQuantityPieces: 0, soldQuantityKg: 0, soldQuantityPieces: 0, otherOutputsQuantityKg: 0, otherOutputsQuantityPieces: 0 };
      entries.set(product.id, entry);
      return entry;
    };
    for (const movement of movements) {
      const entry = entryFor(movement.product);
      const deltaKg = this.movementDelta(movement.previousQuantityKg, movement.newQuantityKg, movement.quantityKg, movement.type);
      const deltaPieces = this.movementDelta(movement.previousQuantityPieces, movement.newQuantityPieces, movement.quantityPieces, movement.type);
      if (movement.createdAt < from) {
        entry.openingQuantityKg += deltaKg;
        entry.openingQuantityPieces += deltaPieces;
      } else if (movement.type !== 'SALE') {
        if (deltaKg >= 0) entry.entriesQuantityKg += deltaKg; else entry.otherOutputsQuantityKg -= deltaKg;
        if (deltaPieces >= 0) entry.entriesQuantityPieces += deltaPieces; else entry.otherOutputsQuantityPieces -= deltaPieces;
      }
    }
    for (const sale of close.sales) for (const item of sale.items) {
      const product = movements.find((movement) => movement.productId === item.productId)?.product ?? counts.find((count) => count.productId === item.productId)?.product;
      if (!product) continue;
      const entry = entryFor(product);
      entry.soldQuantityKg += Number(item.quantityKg ?? 0);
      entry.soldQuantityPieces += item.quantityPieces ?? 0;
    }
    for (const count of counts) entryFor(count.product).count = count;
    return {
      closeId: close.id,
      businessDate: close.businessDate,
      items: [...entries.values()].map((entry) => {
        const theoreticalQuantityKg = entry.openingQuantityKg + entry.entriesQuantityKg - entry.soldQuantityKg - entry.otherOutputsQuantityKg;
        const theoreticalQuantityPieces = entry.openingQuantityPieces + entry.entriesQuantityPieces - entry.soldQuantityPieces - entry.otherOutputsQuantityPieces;
        const physicalQuantityKg = entry.count ? Number(entry.count.physicalQuantityKg) : null;
        const physicalQuantityPieces = entry.count ? entry.count.physicalQuantityPieces : null;
        return {
          ...entry,
          theoreticalQuantityKg,
          theoreticalQuantityPieces,
          physicalQuantityKg,
          physicalQuantityPieces,
          surplusQuantityKg: physicalQuantityKg === null ? 0 : Math.max(physicalQuantityKg - theoreticalQuantityKg, 0),
          shortageQuantityKg: physicalQuantityKg === null ? 0 : Math.max(theoreticalQuantityKg - physicalQuantityKg, 0),
          surplusQuantityPieces: physicalQuantityPieces === null ? 0 : Math.max(physicalQuantityPieces - theoreticalQuantityPieces, 0),
          shortageQuantityPieces: physicalQuantityPieces === null ? 0 : Math.max(theoreticalQuantityPieces - physicalQuantityPieces, 0),
        };
      }).sort((left, right) => left.product.name.localeCompare(right.product.name)),
    };
  }

  private movementDelta(previous: Prisma.Decimal | number | null, next: Prisma.Decimal | number | null, quantity: Prisma.Decimal | number | null, type: string) {
    if (previous !== null && next !== null) return Number(next) - Number(previous);
    const direction = decreaseMovementTypes.has(type) ? -1 : 1;
    return direction * Number(quantity ?? 0);
  }
  private assertCountQuantities(quantityKg?: number, quantityPieces?: number, allowPartial = false) {
    if (!allowPartial && quantityKg === undefined && quantityPieces === undefined) throw new BadRequestException('DAILY_CLOSE_INVENTORY_COUNT_QUANTITY_REQUIRED');
    if ((quantityKg !== undefined && quantityKg < 0) || (quantityPieces !== undefined && quantityPieces < 0)) throw new BadRequestException('DAILY_CLOSE_INVENTORY_COUNT_QUANTITY_INVALID');
  }
  private assertProductCountUnit(unit: string, quantityKg?: number, quantityPieces?: number, allowPartial = false) {
    if (unit === 'KG' && (quantityPieces !== undefined || (!allowPartial && quantityKg === undefined))) throw new BadRequestException('DAILY_CLOSE_INVENTORY_COUNT_UNIT_MISMATCH');
    if (unit === 'PIECE' && (quantityKg !== undefined || (!allowPartial && quantityPieces === undefined))) throw new BadRequestException('DAILY_CLOSE_INVENTORY_COUNT_UNIT_MISMATCH');
  }

  private async requireDraft(id: string, user: AuthenticatedUser) { const close = await this.requireCloseAccess(id, user); if (close.status !== 'DRAFT') throw new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'); return close; }
  private async syncOperations(tx: DailyCloseClient, closeId: string, locationId: string, from: Date, to: Date) {
    await tx.sale.updateMany({ where: { pointOfSaleDailyCloseId: closeId, NOT: { locationId, createdAt: { gte: from, lt: to }, status: 'CONFIRMED' } }, data: { pointOfSaleDailyCloseId: null } });
    await tx.payment.updateMany({ where: { pointOfSaleDailyCloseId: closeId, NOT: { operationalLocationId: locationId, paidAt: { gte: from, lt: to }, ...appliedPaymentWhere, routeId: null } }, data: { pointOfSaleDailyCloseId: null } });
    await tx.sale.updateMany({ where: { locationId, createdAt: { gte: from, lt: to }, status: 'CONFIRMED' }, data: { pointOfSaleDailyCloseId: closeId } });
    await tx.payment.updateMany({ where: { operationalLocationId: locationId, paidAt: { gte: from, lt: to }, ...appliedPaymentWhere, routeId: null, pointOfSaleDailyCloseId: null }, data: { pointOfSaleDailyCloseId: closeId } });
    await tx.inventoryMovement.updateMany({ where: { locationId, createdAt: { gte: from, lt: to }, type: { in: ['IN', 'PURCHASE', 'TRANSFER_IN'] }, pointOfSaleDailyCloseId: null }, data: { pointOfSaleDailyCloseId: closeId } });
  }
  private async bump(tx: DailyCloseClient, id: string) { await tx.pointOfSaleDailyClose.update({ where: { id }, data: { version: { increment: 1 }, lastValidatedAt: null, validatedSourceVersion: null } }); }
  private async transition(id: string, version: number, target: PointOfSaleDailyCloseStatus, data: Prisma.PointOfSaleDailyCloseUncheckedUpdateInput, user: AuthenticatedUser) {
    return this.prisma.$transaction((tx) => this.transitionWithin(tx, id, version, target, data, user));
  }
  private async transitionWithin(tx: Prisma.TransactionClient, id: string, version: number, target: PointOfSaleDailyCloseStatus, data: Prisma.PointOfSaleDailyCloseUncheckedUpdateInput, user: AuthenticatedUser) {
    const current = await this.findClose(id, tx);
    if (!dailyCloseTransitions[current.status].includes(target)) throw new BadRequestException('DAILY_CLOSE_INVALID_STATUS');
    const result = await tx.pointOfSaleDailyClose.updateMany({ where: { id, version, status: current.status }, data: { ...data, version: { increment: 1 } } });
    if (!result.count) throw new ConflictException('DAILY_CLOSE_VERSION_CONFLICT');
    const transitioned = await this.findClose(id, tx);
    const snapshotType = target === 'REVIEWED'
      ? DailyCloseSnapshotType.REVIEWED
      : target === 'CLOSED'
        ? DailyCloseSnapshotType.CLOSED
        : target === 'DRAFT' && (current.status === 'REVIEWED' || current.status === 'CLOSED')
          ? DailyCloseSnapshotType.REOPENED
          : null;
    if (snapshotType) await this.createSnapshot(tx, snapshotType === DailyCloseSnapshotType.REOPENED ? current : transitioned, current.version, snapshotType, user.id);
    await this.createEvent(tx, id, DailyCloseEventType.STATUS_CHANGED, user.id, { fromStatus: current.status, toStatus: target, sourceVersion: current.version });
    return transitioned;
  }
  private async createEvent(tx: Prisma.TransactionClient, closeId: string, type: DailyCloseEventType, userId: string, payload: Record<string, unknown>, idempotencyKey?: string) {
    await tx.dailyCloseEvent.create({ data: { pointOfSaleDailyCloseId: closeId, type, payload: this.jsonPayload(payload), idempotencyKey: idempotencyKey ?? null, createdByUserId: userId } });
  }
  private async createSnapshot(tx: Prisma.TransactionClient, close: object, sourceVersion: number, snapshotType: DailyCloseSnapshotType, userId: string) {
    const payload = this.jsonPayload(close);
    await tx.dailyCloseSnapshot.create({ data: { pointOfSaleDailyCloseId: (close as { id: string }).id, sourceVersion, snapshotType, payload, payloadHash: this.hashPayload(payload), createdByUserId: userId } });
  }
  private async resolveExpenseReplay(closeId: string, idempotencyKey: string, payloadHash: string, user: AuthenticatedUser) {
    const existing = await this.prisma.cashMovement.findUnique({ where: { idempotencyKey } });
    if (!existing) throw new ConflictException('IDEMPOTENCY_RETRY_REQUIRED');
    this.assertSameIdempotencyPayload(existing.idempotencyPayloadHash, payloadHash);
    return this.projectForRole(await this.findClose(closeId), user);
  }
  private async resolveScaleTicketReplay(closeId: string, idempotencyKey: string, payloadHash: string, user: AuthenticatedUser) {
    const existing = await this.prisma.scaleTicketReference.findUnique({ where: { idempotencyKey } });
    if (!existing) throw new ConflictException('IDEMPOTENCY_RETRY_REQUIRED');
    this.assertSameIdempotencyPayload(existing.idempotencyPayloadHash, payloadHash);
    return this.projectForRole(await this.findClose(closeId), user);
  }
  private async resolveInventoryCountReplay(closeId: string, idempotencyKey: string, payloadHash: string, user: AuthenticatedUser) {
    const existing = await this.prisma.dailyCloseInventoryCount.findUnique({ where: { idempotencyKey } });
    if (!existing) throw new ConflictException('IDEMPOTENCY_RETRY_REQUIRED');
    this.assertSameIdempotencyPayload(existing.idempotencyPayloadHash, payloadHash);
    return this.projectForRole(await this.findClose(closeId), user);
  }
  private isIdempotencyRaceError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034');
  }
  private assertSameIdempotencyPayload(existingHash: string | null | undefined, expectedHash: string) {
    if (existingHash !== expectedHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
  }
  private hashPayload(payload: unknown) { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }
  private jsonPayload(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
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
  private async projectDetailForRole<T extends { id: string; operationalLocationId: string; businessDate?: Date }>(close: T, user: AuthenticatedUser) {
    if (!close.businessDate) return this.projectForRole(close, user);
    return this.projectForRole(await this.withExcludedOperations(close as T & { businessDate: Date }), user);
  }
  private async withExcludedOperations<T extends { id: string; operationalLocationId: string; businessDate: Date }>(close: T) {
    const { from, to } = this.operationalDay(close.businessDate);
    const [routePayments, unconfirmedSales] = await Promise.all([
      this.prisma.payment.findMany({
        where: { operationalLocationId: close.operationalLocationId, paidAt: { gte: from, lt: to }, ...appliedPaymentWhere, routeId: { not: null } },
        select: { id: true, amount: true, paidAt: true, referenceNumber: true },
      }),
      this.prisma.sale.findMany({
        where: { locationId: close.operationalLocationId, createdAt: { gte: from, lt: to }, status: { in: ['DRAFT', 'CANCELLED'] } },
        select: { id: true, saleNumber: true, total: true, createdAt: true, status: true },
      }),
    ]);
    return {
      ...close,
      excludedOperations: [
        ...routePayments.map((payment) => ({ id: payment.id, type: 'PAYMENT' as const, reference: payment.referenceNumber || payment.id, amount: payment.amount, reason: 'Pago asociado a una ruta pendiente de liquidación.', occurredAt: payment.paidAt })),
        ...unconfirmedSales.map((sale) => ({ id: sale.id, type: 'SALE' as const, reference: sale.saleNumber, amount: sale.total, reason: sale.status === 'CANCELLED' ? 'Venta cancelada.' : 'Venta todavía no confirmada.', occurredAt: sale.createdAt })),
      ],
    };
  }
  private projectForRole(close: object, user: AuthenticatedUser) {
    const candidate = close as { sales?: Array<{ items: Array<{ costSnapshotSource: 'SALE_CONFIRMATION' | 'LEGACY_BACKFILL' }> }>; updatedAt: Date };
    const result = { ...(Array.isArray(candidate.sales) ? this.withCostQuality(candidate as { sales: Array<{ items: Array<{ costSnapshotSource: 'SALE_CONFIRMATION' | 'LEGACY_BACKFILL' }> }>; updatedAt: Date }) : candidate) } as Record<string, unknown>;
    if (user.role === 'WAREHOUSE') {
      ['payments', 'cashMovements', 'sales', 'cashTotal', 'cardVoucherTotal', 'transferTotal', 'expenseTotal', 'grossSalesTotal', 'netCashExpected', 'cashCountedTotal', 'cashDifferenceTotal', 'purchaseCostTotal', 'grossProfitTotal', 'netProfitTotal', 'costQuality'].forEach((field) => delete result[field]);
      if (Array.isArray(result.lines)) result.lines = result.lines.map(({ amount, ...line }) => line);
      if (Array.isArray(result.scaleTicketReferences)) result.scaleTicketReferences = result.scaleTicketReferences.map(({ amount, unitPrice, ...ticket }) => ticket);
      if (Array.isArray(result.excludedOperations)) result.excludedOperations = result.excludedOperations.filter((operation) => (operation as { type: string }).type === 'SALE');
    }
    if (user.role === 'COLLECTIONS') {
      ['inventoryMovements', 'lines', 'scaleTicketReferences', 'totalInputKg', 'totalSoldKg', 'totalRemainingKg', 'totalShortageKg', 'totalSurplusKg', 'scaleReportedKg', 'scaleDifferenceKg', 'purchaseCostTotal', 'grossProfitTotal', 'netProfitTotal', 'costQuality'].forEach((field) => delete result[field]);
      if (Array.isArray(result.sales)) result.sales = result.sales.map(({ items, ...sale }) => sale);
      if (Array.isArray(result.excludedOperations)) result.excludedOperations = result.excludedOperations.filter((operation) => (operation as { type: string }).type === 'PAYMENT');
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
