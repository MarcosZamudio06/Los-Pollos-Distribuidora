import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  EquivalentStatus,
  InventoryMovementType,
  Prisma,
  ProductUnit,
  PurchaseStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelPurchaseDto, CreatePurchaseDto, CreatePurchaseItemDto, ListPurchasesQueryDto } from './dto';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type ProductRecord = {
  id: string;
  name: string;
  unit: ProductUnit;
  purchaseCost?: DecimalLike;
  isActive: boolean;
  unitEquivalents?: Array<{ id: string; productId: string; factor: DecimalLike; status: EquivalentStatus }>;
};

type PurchaseItemRecord = {
  id: string;
  purchaseId: string;
  productId: string;
  quantity?: DecimalLike;
  quantityKg?: DecimalLike;
  quantityPieces?: number | null;
  unit: ProductUnit;
  unitCost: DecimalLike;
  unitEquivalentId?: string | null;
  appliedEquivalentFactor?: DecimalLike;
  subtotal: DecimalLike;
  createdAt: Date;
  updatedAt: Date;
  product?: { id?: string; name?: string; unit?: ProductUnit } | null;
};

type MovementRecord = {
  id: string;
  productId: string;
  locationId: string;
  userId: string;
  type: InventoryMovementType;
  quantity?: DecimalLike;
  quantityKg?: DecimalLike;
  quantityPieces?: number | null;
  previousStock?: DecimalLike;
  newStock?: DecimalLike;
  previousQuantityKg?: DecimalLike;
  newQuantityKg?: DecimalLike;
  previousQuantityPieces?: number | null;
  newQuantityPieces?: number | null;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  purchaseId?: string | null;
  createdAt: Date;
  product?: { name?: string } | null;
  location?: { name?: string } | null;
};

type PurchaseRecord = {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  userId: string;
  locationId: string;
  subtotal: DecimalLike;
  total: DecimalLike;
  status: PurchaseStatus;
  createdAt: Date;
  updatedAt: Date;
  supplier?: { id?: string; name?: string } | null;
  location?: { id?: string; name?: string } | null;
  user?: { id?: string; name?: string } | null;
  items?: PurchaseItemRecord[];
  inventoryMovements?: MovementRecord[];
};

type NormalizedQuantities = { quantityKg: number; quantityPieces: number };
type AppliedBalanceChange = {
  previousQuantityKg: number;
  previousQuantityPieces: number;
  newQuantityKg: number;
  newQuantityPieces: number;
};

type PreparedItem = {
  dto: CreatePurchaseItemDto;
  product: ProductRecord;
  quantityKg: number;
  quantityPieces: number;
  quantity: number;
  unitCost: number;
  subtotal: number;
  unitEquivalentId: string | null;
  appliedEquivalentFactor: number | null;
};

const PURCHASE_INCLUDE = {
  supplier: true,
  location: true,
  user: true,
  items: { include: { product: true } },
  inventoryMovements: {
    include: { product: true, location: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListPurchasesQueryDto = {}) {
    const where = this.buildPurchaseWhere(query);
    const pagination = this.buildPagination(query);
    const [total, purchases] = await Promise.all([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
        where,
        include: { supplier: true, location: true },
        orderBy: { createdAt: 'desc' },
        ...pagination,
      }),
    ]);
    const page = query.page ?? 1;
    const limit = query.limit ?? total;

    return {
      items: (purchases as PurchaseRecord[]).map((purchase) => this.toPurchaseListItem(purchase)),
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }

  async findOne(id: string) {
    return this.toPurchaseDetail(await this.findPurchaseOrThrow(id));
  }

  async create(dto: CreatePurchaseDto, currentUser: AuthenticatedUser, idempotencyKey: string) {
    this.assertCreateShape(dto);

    return this.prisma.$transaction(async (tx) => {
      const purchaseNumber = this.resolveIdempotentPurchaseNumber(idempotencyKey);
      const existing = (await tx.purchase.findUnique({
        where: { purchaseNumber },
        include: PURCHASE_INCLUDE,
      })) as PurchaseRecord | null;
      if (existing) {
        this.assertSameCreatePayload(existing, dto, currentUser.id);
        return this.toPurchaseDetail(existing);
      }

      await this.assertSupplierAvailable(tx, dto.supplierId);
      await this.assertLocationAvailable(tx, dto.locationId);
      this.assertCostUpdateAllowed(dto, currentUser);
      const preparedItems = await this.prepareItems(tx, dto.items);
      const total = this.roundMoney(preparedItems.reduce((sum, item) => sum + item.subtotal, 0));

      const purchase = (await tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId: dto.supplierId,
          locationId: dto.locationId,
          userId: currentUser.id,
          subtotal: total,
          total,
          status: PurchaseStatus.CONFIRMED,
          items: {
            create: preparedItems.map((item) => ({
              productId: item.product.id,
              unit: item.dto.unit,
              quantity: item.quantity,
              quantityKg: item.quantityKg,
              quantityPieces: item.quantityPieces,
              unitCost: item.unitCost,
              unitEquivalentId: item.unitEquivalentId,
              appliedEquivalentFactor: item.appliedEquivalentFactor,
              subtotal: item.subtotal,
            })),
          },
        },
        include: PURCHASE_INCLUDE,
      })) as PurchaseRecord;

      for (const item of preparedItems) {
        const quantities = { quantityKg: item.quantityKg, quantityPieces: item.quantityPieces };
        const balanceChange = await this.applyBalanceChange(tx, item.product.id, dto.locationId, 1, quantities);
        await this.createMovement(tx, purchase.id, item.product.id, dto.locationId, currentUser.id, InventoryMovementType.PURCHASE, quantities, balanceChange, 'Purchase confirmation');

        if (dto.allowCostUpdate === true) {
          await tx.product.update({ where: { id: item.product.id }, data: { purchaseCost: item.unitCost } });
        }
      }

      return this.toPurchaseDetail(await this.findPurchaseOrThrow(purchase.id, tx));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(id: string, dto: CancelPurchaseDto, currentUser: AuthenticatedUser, idempotencyKey: string) {
    const reason = this.normalizeRequiredReason(dto.reason);

    return this.prisma.$transaction(async (tx) => {
      const purchase = await this.findPurchaseOrThrow(id, tx);
      const marker = this.buildCommandMarker('CANCEL', idempotencyKey, { purchaseId: id, userId: currentUser.id, reason });

      if (purchase.status === PurchaseStatus.CANCELLED) {
        this.assertSameCancelCommand(purchase, marker);
        return this.toPurchaseDetail(purchase);
      }

      if (purchase.status !== PurchaseStatus.CONFIRMED) {
        throw new BadRequestException('Only confirmed purchases can be cancelled');
      }

      for (const item of purchase.items ?? []) {
        const quantities = this.normalizeExistingItemQuantities(item);
        const balanceChange = await this.applyBalanceChange(tx, item.productId, purchase.locationId, -1, quantities);
        await this.createMovement(tx, purchase.id, item.productId, purchase.locationId, currentUser.id, InventoryMovementType.CANCEL_PURCHASE, quantities, balanceChange, this.withCommandMarker(reason, marker));
      }

      await tx.purchase.update({ where: { id }, data: { status: PurchaseStatus.CANCELLED }, include: PURCHASE_INCLUDE });
      return this.toPurchaseDetail(await this.findPurchaseOrThrow(id, tx));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private assertCreateShape(dto: CreatePurchaseDto): void {
    if (!dto.supplierId?.trim()) throw new BadRequestException('supplierId is required');
    if (!dto.locationId?.trim()) throw new BadRequestException('locationId is required');
    if (!dto.items?.length) throw new BadRequestException('Purchase requires at least one item');
  }

  private async assertSupplierAvailable(tx: Prisma.TransactionClient, supplierId: string): Promise<void> {
    const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true, isActive: true } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (!supplier.isActive) throw new BadRequestException('Purchase requires an active supplier');
  }

  private async assertLocationAvailable(tx: Prisma.TransactionClient, locationId: string): Promise<void> {
    const location = await tx.operationalLocation.findUnique({ where: { id: locationId }, select: { id: true, isActive: true, name: true } });
    if (!location) throw new NotFoundException('Location not found');
    if (!location.isActive) throw new BadRequestException('Purchase receiver location must be active');
  }

  private assertCostUpdateAllowed(dto: CreatePurchaseDto, currentUser: AuthenticatedUser): void {
    if (dto.allowCostUpdate === true && currentUser.role !== 'ADMIN') {
      throw new BadRequestException('Product cost updates require ADMIN authorization');
    }
  }

  private async prepareItems(tx: Prisma.TransactionClient, items: CreatePurchaseItemDto[]): Promise<PreparedItem[]> {
    const prepared: PreparedItem[] = [];
    for (const dto of items) {
      const product = (await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, name: true, unit: true, purchaseCost: true, isActive: true, unitEquivalents: true },
      })) as ProductRecord | null;
      if (!product) throw new NotFoundException('Product not found');
      if (!product.isActive) throw new BadRequestException('Inactive products cannot be purchased');

      const quantities = this.normalizeItemQuantities(dto.unit, product.unit, dto.quantityKg, dto.quantityPieces);
      const equivalent = dto.unitEquivalentId ? product.unitEquivalents?.find((candidate) => candidate.id === dto.unitEquivalentId && candidate.status === EquivalentStatus.ACTIVE) : undefined;
      if (dto.unitEquivalentId && !equivalent) {
        throw new BadRequestException('Active unit equivalent not found for product');
      }

      const unitCost = this.roundMoney(dto.unitCost);
      const quantity = quantities.quantityKg > 0 ? quantities.quantityKg : quantities.quantityPieces;
      const subtotal = this.roundMoney(unitCost * quantity);
      prepared.push({
        dto,
        product,
        quantityKg: quantities.quantityKg,
        quantityPieces: quantities.quantityPieces,
        quantity,
        unitCost,
        subtotal,
        unitEquivalentId: equivalent?.id ?? null,
        appliedEquivalentFactor: equivalent ? this.toNumber(equivalent.factor) : null,
      });
    }
    return prepared;
  }

  private normalizeItemQuantities(requestedUnit: ProductUnit, productUnit: ProductUnit, quantityKg?: number, quantityPieces?: number): NormalizedQuantities {
    const quantities = { quantityKg: quantityKg ?? 0, quantityPieces: quantityPieces ?? 0 };
    if (quantities.quantityKg < 0 || quantities.quantityPieces < 0) throw new BadRequestException('Purchase quantities must be non-negative');

    if (productUnit === ProductUnit.KG && (requestedUnit !== ProductUnit.KG || quantities.quantityKg <= 0 || quantities.quantityPieces !== 0)) {
      throw new BadRequestException('KG products require a positive quantityKg only');
    }
    if (productUnit === ProductUnit.PIECE && (requestedUnit !== ProductUnit.PIECE || quantities.quantityPieces <= 0 || quantities.quantityKg !== 0)) {
      throw new BadRequestException('PIECE products require a positive quantityPieces only');
    }
    if (productUnit === ProductUnit.KG_AND_PIECE) {
      if (requestedUnit === ProductUnit.KG && (quantities.quantityKg <= 0 || quantities.quantityPieces !== 0)) throw new BadRequestException('KG purchases require a positive quantityKg only');
      if (requestedUnit === ProductUnit.PIECE && (quantities.quantityPieces <= 0 || quantities.quantityKg !== 0)) throw new BadRequestException('PIECE purchases require a positive quantityPieces only');
      if (requestedUnit === ProductUnit.KG_AND_PIECE && quantities.quantityKg <= 0 && quantities.quantityPieces <= 0) throw new BadRequestException('KG_AND_PIECE purchases require quantityKg, quantityPieces, or both');
    }
    return quantities;
  }

  private normalizeExistingItemQuantities(item: PurchaseItemRecord): NormalizedQuantities {
    const quantities = { quantityKg: this.toNumber(item.quantityKg), quantityPieces: item.quantityPieces ?? 0 };
    if (quantities.quantityKg <= 0 && quantities.quantityPieces <= 0) throw new BadRequestException('Purchase item must include a positive quantity');
    return quantities;
  }

  private async applyBalanceChange(tx: Prisma.TransactionClient, productId: string, locationId: string, direction: 1 | -1, quantities: NormalizedQuantities): Promise<AppliedBalanceChange> {
    if (direction === -1) {
      const updated = await tx.inventoryBalance.updateMany({
        where: { productId, locationId, quantityKg: { gte: quantities.quantityKg }, quantityPieces: { gte: quantities.quantityPieces } },
        data: { quantityKg: { decrement: quantities.quantityKg }, quantityPieces: { decrement: quantities.quantityPieces } },
      });
      if (updated.count !== 1) throw new BadRequestException('Purchase cancellation cannot leave negative stock at receiver location');
    } else {
      await tx.inventoryBalance.upsert({
        where: { productId_locationId: { productId, locationId } },
        create: { productId, locationId, quantityKg: quantities.quantityKg, quantityPieces: quantities.quantityPieces },
        update: { quantityKg: { increment: quantities.quantityKg }, quantityPieces: { increment: quantities.quantityPieces } },
      });
    }

    const balance = await tx.inventoryBalance.findUnique({ where: { productId_locationId: { productId, locationId } } });
    if (!balance) throw new BadRequestException('Inventory balance could not be updated');
    const newQuantityKg = this.toNumber(balance.quantityKg);
    const newQuantityPieces = balance.quantityPieces;
    return {
      previousQuantityKg: this.roundQuantity(newQuantityKg - direction * quantities.quantityKg),
      previousQuantityPieces: newQuantityPieces - direction * quantities.quantityPieces,
      newQuantityKg,
      newQuantityPieces,
    };
  }

  private async createMovement(tx: Prisma.TransactionClient, purchaseId: string, productId: string, locationId: string, userId: string, type: InventoryMovementType, quantities: NormalizedQuantities, balanceChange: AppliedBalanceChange, reason: string): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        productId,
        locationId,
        userId,
        type,
        quantity: quantities.quantityKg > 0 ? quantities.quantityKg : quantities.quantityPieces,
        quantityKg: quantities.quantityKg,
        quantityPieces: quantities.quantityPieces,
        previousStock: balanceChange.previousQuantityKg,
        newStock: balanceChange.newQuantityKg,
        previousQuantityKg: balanceChange.previousQuantityKg,
        newQuantityKg: balanceChange.newQuantityKg,
        previousQuantityPieces: balanceChange.previousQuantityPieces,
        newQuantityPieces: balanceChange.newQuantityPieces,
        reason,
        referenceType: 'PURCHASE',
        referenceId: purchaseId,
        purchaseId,
      },
      include: { product: true, location: true },
    });
  }

  private async findPurchaseOrThrow(id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<PurchaseRecord> {
    const purchase = (await tx.purchase.findFirst({ where: { id }, include: PURCHASE_INCLUDE })) as PurchaseRecord | null;
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }

  private buildPurchaseWhere(query: ListPurchasesQueryDto): Prisma.PurchaseWhereInput {
    return {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo ? { createdAt: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) } } : {}),
    };
  }

  private buildPagination(query: Pick<ListPurchasesQueryDto, 'page' | 'limit'>): Pick<Prisma.PurchaseFindManyArgs, 'skip' | 'take'> {
    if (!query.limit) return {};
    return { skip: ((query.page ?? 1) - 1) * query.limit, take: query.limit };
  }

  private resolveIdempotentPurchaseNumber(idempotencyKey: string): string {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 24).toUpperCase();
    return `PUR-IDEMP-${digest}`;
  }

  private assertSameCreatePayload(purchase: PurchaseRecord, dto: CreatePurchaseDto, userId: string): void {
    const existingItems = this.normalizeComparableItems((purchase.items ?? []).map((item) => ({ productId: item.productId, unit: item.unit, quantityKg: this.toNumber(item.quantityKg), quantityPieces: item.quantityPieces ?? 0, unitCost: this.toNumber(item.unitCost), unitEquivalentId: item.unitEquivalentId ?? undefined })));
    const requestedItems = this.normalizeComparableItems(dto.items ?? []);
    if (purchase.supplierId !== dto.supplierId || purchase.locationId !== dto.locationId || purchase.userId !== userId || JSON.stringify(existingItems) !== JSON.stringify(requestedItems)) {
      throw new ConflictException('Idempotency-Key was already used for a different purchase payload');
    }
  }

  private normalizeComparableItems(items: Array<{ productId: string; unit: ProductUnit; quantityKg?: number; quantityPieces?: number; unitCost: number; unitEquivalentId?: string }>): string[] {
    return items.map((item) => [item.productId, item.unit, item.quantityKg ?? 0, item.quantityPieces ?? 0, item.unitCost, item.unitEquivalentId ?? ''].join('|')).sort();
  }

  private buildCommandMarker(action: 'CANCEL', idempotencyKey: string, payload: Record<string, unknown>): string {
    const digest = createHash('sha256').update(JSON.stringify({ action, idempotencyKey, payload })).digest('hex').slice(0, 24).toUpperCase();
    return `[idempotency:${action}:${digest}]`;
  }

  private assertSameCancelCommand(purchase: PurchaseRecord, expectedMarker: string): void {
    const marker = (purchase.inventoryMovements ?? []).map((movement) => movement.reason ?? '').find((reason) => reason.includes('[idempotency:CANCEL:'));
    if (!marker?.includes(expectedMarker)) throw new ConflictException('Idempotency-Key does not match the completed purchase cancel command');
  }

  private withCommandMarker(value: string, marker: string): string {
    return `${value} ${marker}`;
  }

  private stripCommandMarker(value?: string | null): string | null {
    const stripped = value?.replace(/\s*\[idempotency:CANCEL:[A-F0-9]{24}\]$/, '').trim();
    return stripped ? stripped : null;
  }

  private normalizeRequiredReason(reason?: string): string {
    const normalized = reason?.trim();
    if (!normalized) throw new BadRequestException('reason is required');
    return normalized;
  }

  private toPurchaseListItem(purchase: PurchaseRecord) {
    return {
      id: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplier?.name ?? null,
      userId: purchase.userId,
      locationId: purchase.locationId,
      subtotal: this.decimalToString(purchase.subtotal),
      total: this.decimalToString(purchase.total),
      status: purchase.status,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  }

  private toPurchaseDetail(purchase: PurchaseRecord) {
    return {
      ...this.toPurchaseListItem(purchase),
      locationName: purchase.location?.name ?? null,
      items: (purchase.items ?? []).map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name ?? null,
        unit: item.unit,
        quantity: this.decimalToString(item.quantity),
        quantityKg: this.decimalToString(item.quantityKg),
        quantityPieces: item.quantityPieces ?? 0,
        unitCost: this.decimalToString(item.unitCost),
        unitEquivalentId: item.unitEquivalentId ?? null,
        appliedEquivalentFactor: this.decimalToString(item.appliedEquivalentFactor),
        subtotal: this.decimalToString(item.subtotal),
      })),
      inventoryMovements: (purchase.inventoryMovements ?? []).map((movement) => this.toMovementResponse(movement)),
    };
  }

  private toMovementResponse(movement: MovementRecord) {
    return {
      id: movement.id,
      productId: movement.productId,
      productName: movement.product?.name ?? null,
      locationId: movement.locationId,
      locationName: movement.location?.name ?? null,
      type: movement.type,
      quantity: this.decimalToString(movement.quantity),
      quantityKg: this.decimalToString(movement.quantityKg),
      quantityPieces: movement.quantityPieces ?? 0,
      previousStock: this.decimalToString(movement.previousStock),
      newStock: this.decimalToString(movement.newStock),
      previousQuantityKg: this.decimalToString(movement.previousQuantityKg),
      newQuantityKg: this.decimalToString(movement.newQuantityKg),
      previousQuantityPieces: movement.previousQuantityPieces ?? 0,
      newQuantityPieces: movement.newQuantityPieces ?? 0,
      reason: this.stripCommandMarker(movement.reason),
      referenceType: movement.referenceType ?? null,
      referenceId: movement.referenceId ?? null,
      purchaseId: movement.purchaseId ?? null,
      userId: movement.userId,
      createdAt: movement.createdAt,
    };
  }

  private decimalToString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return value instanceof Prisma.Decimal ? value.toString() : String(value);
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) return 0;
    return Number(value instanceof Prisma.Decimal ? value.toString() : value);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

}