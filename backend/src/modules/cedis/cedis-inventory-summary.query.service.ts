import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CedisInventorySummaryQueryDto } from './dto';

type SummaryActor = Pick<AuthenticatedUser, 'role' | 'operationalLocationId'>;

type Quantity = { kg: string; pieces: string };
type QuantityAccumulator = { kg: number; pieces: number };

type SummaryProduct = {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  opening: QuantityAccumulator;
  reservedAtCedis: QuantityAccumulator;
  inBranchCustody: QuantityAccumulator;
  receivedFromSuppliers: QuantityAccumulator;
  sentToBranches: QuantityAccumulator;
  returnedFromBranches: QuantityAccumulator;
  otherNet: QuantityAccumulator;
  remaining: QuantityAccumulator;
  firstDayMovement?: RawMovement;
  hasMovementBeforeDay: boolean;
  hasMovementUntilEnd: boolean;
  fallbackBalance: QuantityAccumulator;
};

type RawMovement = {
  id: string;
  productId: string;
  type: string;
  quantityKg: Prisma.Decimal | number | string | null;
  quantityPieces: number | null;
  previousQuantityKg: Prisma.Decimal | number | string | null;
  previousQuantityPieces: number | null;
  newQuantityKg: Prisma.Decimal | number | string | null;
  newQuantityPieces: number | null;
  createdAt: Date;
  product: { name: string; sku: string | null; unit: string };
  transfer: {
    originLocation: { type: string };
    destinationLocation: { type: string };
    branchSupplyCycleTransfer: { role: string } | null;
  } | null;
};

const DECREASE_TYPES = new Set([
  'OUT',
  'SALE',
  'CANCEL_PURCHASE',
  'TRANSFER_OUT',
  'SHRINKAGE',
]);

@Injectable()
export class CedisInventorySummaryQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getSummary(query: CedisInventorySummaryQueryDto, actor: SummaryActor) {
    const { start, end } = this.parseBusinessDate(query.businessDate);
    const cedis = await this.prisma.operationalLocation.findUnique({
      where: { id: query.cedisLocationId },
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        isActive: true,
      },
    });

    if (!cedis) throw new NotFoundException('CEDIS not found');
    if (
      cedis.type !== 'DISTRIBUTION_CENTER' ||
      cedis.parentId !== null ||
      !cedis.isActive
    ) {
      throw new BadRequestException(
        'CEDIS location is not active or compatible',
      );
    }
    if (
      actor.role !== 'ADMIN' &&
      (actor.role !== 'WAREHOUSE' ||
        actor.operationalLocationId !== query.cedisLocationId)
    ) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }

    const [balances, branchBalances, movements] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where: { locationId: query.cedisLocationId },
        include: { product: true },
      }),
      this.prisma.inventoryBalance.findMany({
        where: {
          location: {
            parentId: query.cedisLocationId,
            type: 'BRANCH',
            isActive: true,
          },
        },
        include: { product: true },
      }),
      this.prisma.inventoryMovement.findMany({
        where: {
          locationId: query.cedisLocationId,
          createdAt: { lt: end },
        },
        include: {
          product: { select: { name: true, sku: true, unit: true } },
          transfer: {
            select: {
              originLocation: { select: { type: true } },
              destinationLocation: { select: { type: true } },
              branchSupplyCycleTransfer: { select: { role: true } },
            },
          },
        },
        orderBy: [{ productId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const products = new Map<string, SummaryProduct>();
    for (const balance of balances) {
      products.set(
        balance.productId,
        this.createProductSummary({
          productId: balance.productId,
          productName: balance.product.name,
          sku: balance.product.sku,
          unit: balance.product.unit,
          fallbackBalance: {
            kg: this.number(balance.quantityKg),
            pieces: balance.quantityPieces,
          },
          reservedAtCedis: {
            kg: this.number(balance.reservedQuantityKg),
            pieces: balance.reservedQuantityPieces ?? 0,
          },
        }),
      );
    }

    for (const balance of branchBalances) {
      const product =
        products.get(balance.productId) ??
        this.createProductSummary({
          productId: balance.productId,
          productName: balance.product.name,
          sku: balance.product.sku,
          unit: balance.product.unit,
          fallbackBalance: { kg: 0, pieces: 0 },
        });
      this.add(product.inBranchCustody, {
        kg: this.number(balance.quantityKg),
        pieces: balance.quantityPieces,
      });
      products.set(balance.productId, product);
    }

    let lastMovementAt: Date | null = null;
    for (const movement of movements as unknown as RawMovement[]) {
      const product =
        products.get(movement.productId) ??
        this.createProductSummary({
          productId: movement.productId,
          productName: movement.product.name,
          sku: movement.product.sku,
          unit: movement.product.unit,
          fallbackBalance: { kg: 0, pieces: 0 },
        });
      products.set(movement.productId, product);

      if (movement.createdAt < start) {
        product.hasMovementBeforeDay = true;
        product.opening = this.movementNewQuantity(movement);
      }
      if (movement.createdAt < end) {
        product.hasMovementUntilEnd = true;
        product.remaining = this.movementNewQuantity(movement);
        lastMovementAt = movement.createdAt;
      }
      if (movement.createdAt >= start && movement.createdAt < end) {
        product.firstDayMovement ??= movement;
        this.applyDailyMovement(product, movement);
      }
    }

    const items = [...products.values()]
      .map((product) => this.finalizeProduct(product))
      .sort((left, right) => left.productName.localeCompare(right.productName));

    return {
      cedis: { id: cedis.id, name: cedis.name },
      businessDate: query.businessDate,
      generatedAt: new Date().toISOString(),
      dataAsOf: (lastMovementAt ?? new Date()).toISOString(),
      timeZone: this.timeZone(),
      totals: this.sumTotals(items),
      items,
    };
  }

  private createProductSummary(input: {
    productId: string;
    productName: string;
    sku: string | null;
    unit: string;
    fallbackBalance: QuantityAccumulator;
    reservedAtCedis?: QuantityAccumulator;
  }): SummaryProduct {
    return {
      ...input,
      opening: { kg: 0, pieces: 0 },
      reservedAtCedis: { ...(input.reservedAtCedis ?? { kg: 0, pieces: 0 }) },
      inBranchCustody: { kg: 0, pieces: 0 },
      receivedFromSuppliers: { kg: 0, pieces: 0 },
      sentToBranches: { kg: 0, pieces: 0 },
      returnedFromBranches: { kg: 0, pieces: 0 },
      otherNet: { kg: 0, pieces: 0 },
      remaining: { kg: 0, pieces: 0 },
      hasMovementBeforeDay: false,
      hasMovementUntilEnd: false,
    };
  }

  private finalizeProduct(product: SummaryProduct) {
    if (!product.hasMovementBeforeDay) {
      product.opening = product.firstDayMovement
        ? this.movementPreviousQuantity(product.firstDayMovement)
        : { ...product.fallbackBalance };
    }
    if (!product.hasMovementUntilEnd) {
      product.remaining = { ...product.fallbackBalance };
    }

    const physicalAtCedis = { ...product.remaining };
    const availableToDispatch = {
      kg: Math.max(physicalAtCedis.kg - product.reservedAtCedis.kg, 0),
      pieces: Math.max(
        physicalAtCedis.pieces - product.reservedAtCedis.pieces,
        0,
      ),
    };
    const ownedNetworkTotal = {
      kg: physicalAtCedis.kg + product.inBranchCustody.kg,
      pieces: physicalAtCedis.pieces + product.inBranchCustody.pieces,
    };

    return {
      productId: product.productId,
      productName: product.productName,
      sku: product.sku,
      unit: product.unit,
      opening: this.quantity(product.opening),
      physicalAtCedis: this.quantity(physicalAtCedis),
      reservedAtCedis: this.quantity(product.reservedAtCedis),
      availableToDispatch: this.quantity(availableToDispatch),
      inBranchCustody: this.quantity(product.inBranchCustody),
      ownedNetworkTotal: this.quantity(ownedNetworkTotal),
      receivedFromSuppliers: this.quantity(product.receivedFromSuppliers),
      sentToBranches: this.quantity(product.sentToBranches),
      returnedFromBranches: this.quantity(product.returnedFromBranches),
      otherNet: this.quantity(product.otherNet),
      remaining: this.quantity(product.remaining),
    };
  }

  private applyDailyMovement(product: SummaryProduct, movement: RawMovement) {
    const quantity = {
      kg: this.number(movement.quantityKg),
      pieces: movement.quantityPieces ?? 0,
    };
    const sign = DECREASE_TYPES.has(movement.type) ? -1 : 1;

    if (movement.type === 'PURCHASE' || movement.type === 'CANCEL_PURCHASE') {
      this.add(product.receivedFromSuppliers, quantity, sign);
      return;
    }

    const role = movement.transfer?.branchSupplyCycleTransfer?.role;
    const isBranchSupply =
      role === 'SUPPLY' ||
      (movement.type === 'TRANSFER_OUT' &&
        movement.transfer?.destinationLocation.type === 'BRANCH');
    const isBranchReturn =
      role === 'RETURN' ||
      (movement.type === 'TRANSFER_IN' &&
        movement.transfer?.originLocation.type === 'BRANCH');

    if (isBranchSupply && movement.type === 'TRANSFER_OUT') {
      this.add(product.sentToBranches, quantity);
      return;
    }
    if (isBranchReturn && movement.type === 'TRANSFER_IN') {
      this.add(product.returnedFromBranches, quantity);
      return;
    }

    this.add(product.otherNet, quantity, sign);
  }

  private sumTotals(items: Array<Record<string, unknown>>) {
    const fields = [
      'opening',
      'physicalAtCedis',
      'reservedAtCedis',
      'availableToDispatch',
      'inBranchCustody',
      'ownedNetworkTotal',
      'receivedFromSuppliers',
      'sentToBranches',
      'returnedFromBranches',
      'otherNet',
      'remaining',
    ] as const;
    const totals: Record<string, QuantityAccumulator> = {};
    for (const field of fields) totals[field] = { kg: 0, pieces: 0 };
    for (const item of items) {
      for (const field of fields) {
        const quantity = item[field] as Quantity;
        totals[field].kg += Number(quantity.kg);
        totals[field].pieces += Number(quantity.pieces);
      }
    }
    return Object.fromEntries(
      fields.map((field) => [field, this.quantity(totals[field])]),
    );
  }

  private movementNewQuantity(movement: RawMovement): QuantityAccumulator {
    return {
      kg: this.number(movement.newQuantityKg),
      pieces: movement.newQuantityPieces ?? 0,
    };
  }

  private movementPreviousQuantity(movement: RawMovement): QuantityAccumulator {
    return {
      kg: this.number(movement.previousQuantityKg),
      pieces: movement.previousQuantityPieces ?? 0,
    };
  }

  private add(
    target: QuantityAccumulator,
    value: QuantityAccumulator,
    sign = 1,
  ): void {
    target.kg += value.kg * sign;
    target.pieces += value.pieces * sign;
  }

  private quantity(value: QuantityAccumulator): Quantity {
    return { kg: value.kg.toFixed(3), pieces: value.pieces.toFixed(3) };
  }

  private number(value: Prisma.Decimal | number | string | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value);
  }

  private parseBusinessDate(value: string) {
    const start = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      start.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('INVALID_BUSINESS_DATE');
    }
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }

  private timeZone() {
    return (
      this.config.get<string>('app.timezone') ??
      process.env.APP_TIMEZONE?.trim() ??
      'America/Mexico_City'
    );
  }
}
