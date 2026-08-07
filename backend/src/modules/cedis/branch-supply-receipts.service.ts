import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchSupplyCycleStatus,
  BranchSupplyTransferRole,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  InventoryTransfersService,
  SupplyReceiptItemInput,
} from '../inventory/inventory-transfers.service';
import { ListIncomingSuppliesQueryDto, ReceiveIncomingSupplyDto } from './dto';

type ReceiptActor = Pick<
  AuthenticatedUser,
  'id' | 'role' | 'operationalLocationId' | 'permissions'
>;

const INCOMING_SUPPLY_INCLUDE = {
  branchSupplyCycle: {
    include: {
      distributionCenterLocation: true,
      branchLocation: true,
    },
  },
  inventoryTransfer: {
    include: {
      originLocation: true,
      destinationLocation: true,
      items: { include: { product: true } },
      branchSupplyReceipt: {
        include: {
          receivedBy: { select: { id: true, name: true } },
          items: { orderBy: { createdAt: 'asc' as const } },
        },
      },
    },
  },
} as const;

type IncomingSupplyLink = Prisma.BranchSupplyCycleTransferGetPayload<{
  include: typeof INCOMING_SUPPLY_INCLUDE;
}>;

type NormalizedReceiptItem = {
  transferItemId: string;
  productId: string;
  productName: string;
  unit: ProductUnit;
  sentKg: number;
  sentPieces: number;
  receivedKg: number;
  receivedPieces: number;
  differenceKg: number;
  differencePieces: number;
};

export type IncomingSupplyResponse = {
  id: string;
  transferNumber: string;
  cycleId: string;
  cycleVersion: number;
  businessDate: string;
  status: 'PENDING' | 'RECEIVED';
  origin: { id: string; name: string; code: string | null };
  destination: { id: string; name: string; code: string | null };
  notes: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: Array<{
    transferItemId: string;
    productId: string;
    productName: string;
    unit: ProductUnit;
    quantityKg: number;
    quantityPieces: number;
  }>;
  receipt: {
    id: string;
    receivedAt: string;
    notes: string | null;
    receivedBy: { id: string; name: string };
    items: NormalizedReceiptItem[];
  } | null;
};

type IncomingSupplyListResponse = {
  items: IncomingSupplyResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class BranchSupplyReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryTransfers: InventoryTransfersService,
  ) {}

  async list(
    query: ListIncomingSuppliesQueryDto,
    actor: ReceiptActor,
  ): Promise<IncomingSupplyListResponse> {
    this.assertPermission(actor);
    const links = (await this.prisma.branchSupplyCycleTransfer.findMany({
      where: {
        role: BranchSupplyTransferRole.SUPPLY,
        branchSupplyCycle: {
          is: this.buildCycleScope(query, actor),
        },
      },
      include: INCOMING_SUPPLY_INCLUDE,
      orderBy: { linkedAt: 'desc' },
    })) as IncomingSupplyLink[];

    const filtered = links.filter((link) => {
      const received = Boolean(link.inventoryTransfer.branchSupplyReceipt);
      return query.status === undefined
        ? true
        : query.status === 'RECEIVED'
          ? received
          : !received;
    });
    filtered.sort((left, right) => {
      const receivedDifference =
        Number(Boolean(left.inventoryTransfer.branchSupplyReceipt)) -
        Number(Boolean(right.inventoryTransfer.branchSupplyReceipt));
      if (receivedDifference !== 0) return receivedDifference;
      return (
        this.dateValue(
          right.inventoryTransfer.requestedAt ??
            right.inventoryTransfer.createdAt,
        ) -
        this.dateValue(
          left.inventoryTransfer.requestedAt ??
            left.inventoryTransfer.createdAt,
        )
      );
    });

    const total = filtered.length;
    const start = (query.page - 1) * query.limit;
    return {
      items: filtered
        .slice(start, start + query.limit)
        .map((link) => this.toResponse(link)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async findOne(
    transferId: string,
    actor: ReceiptActor,
  ): Promise<IncomingSupplyResponse> {
    this.assertPermission(actor);
    const link = await this.findLink(this.prisma, transferId);
    this.assertLinkScope(link, actor);
    return this.toResponse(link);
  }

  async receive(
    transferId: string,
    dto: ReceiveIncomingSupplyDto,
    actor: ReceiptActor,
    idempotencyKey: string,
  ): Promise<IncomingSupplyResponse> {
    this.assertPermission(actor);
    const key = idempotencyKey.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const effectiveKey = `cedis:receive-supply:${transferId}:${key}`;
    const payloadHash = this.hashPayload({
      transferId,
      dto,
      actorId: actor.id,
    });

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.branchSupplyReceipt.findUnique({
            where: { idempotencyKey: effectiveKey },
            include: {
              receivedBy: { select: { id: true, name: true } },
              items: { orderBy: { createdAt: 'asc' } },
            },
          });
          if (existing) {
            if (existing.payloadHash !== payloadHash) {
              throw new ConflictException('IDEMPOTENCY_CONFLICT');
            }
            const replay = await this.findLink(tx, transferId);
            this.assertLinkScope(replay, actor);
            return this.toResponse(replay);
          }

          const link = await this.findLink(tx, transferId);
          this.assertLinkScope(link, actor);
          this.assertReceivable(link, dto.expectedCycleVersion);
          const normalizedItems = this.normalizeReceiptItems(link, dto);
          const hasDifference = normalizedItems.some(
            (item) => item.differenceKg !== 0 || item.differencePieces !== 0,
          );
          const notes = this.normalizeText(dto.notes);
          if (hasDifference && !notes) {
            throw new BadRequestException(
              'BRANCH_SUPPLY_RECEIPT_NOTE_REQUIRED',
            );
          }

          const receiptId = randomUUID();
          await tx.branchSupplyReceipt.create({
            data: {
              id: receiptId,
              inventoryTransferId: transferId,
              branchSupplyCycleId: link.branchSupplyCycleId,
              receivedByUserId: actor.id,
              notes,
              idempotencyKey: effectiveKey,
              payloadHash,
            },
          });

          const input: SupplyReceiptItemInput[] = normalizedItems.map(
            (item) => ({
              transferItemId: item.transferItemId,
              quantityKg: item.receivedKg,
              quantityPieces: item.receivedPieces,
            }),
          );
          await this.inventoryTransfers.receiveSupply(
            transferId,
            input,
            actor.id,
            key,
            {
              tx,
              receiptId,
              actor,
            },
          );

          await tx.branchSupplyReceiptItem.createMany({
            data: normalizedItems.map((item) => ({
              id: randomUUID(),
              receiptId,
              transferItemId: item.transferItemId,
              productId: item.productId,
              productNameSnapshot: item.productName,
              unit: item.unit,
              sentKg: item.sentKg,
              sentPieces: item.sentPieces,
              receivedKg: item.receivedKg,
              receivedPieces: item.receivedPieces,
              differenceKg: item.differenceKg,
              differencePieces: item.differencePieces,
            })),
          });

          return this.toResponse(await this.findLink(tx, transferId));
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async findLink(
    client: PrismaService | Prisma.TransactionClient,
    transferId: string,
  ): Promise<IncomingSupplyLink> {
    const link = await client.branchSupplyCycleTransfer.findUnique({
      where: { inventoryTransferId: transferId },
      include: INCOMING_SUPPLY_INCLUDE,
    });
    if (!link || link.role !== BranchSupplyTransferRole.SUPPLY) {
      throw new NotFoundException('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
    }
    return link;
  }

  private buildCycleScope(
    query: ListIncomingSuppliesQueryDto,
    actor: ReceiptActor,
  ): Prisma.BranchSupplyCycleWhereInput {
    return {
      businessDate: this.parseBusinessDate(query.businessDate),
      ...(query.branchLocationId
        ? { branchLocationId: query.branchLocationId }
        : {}),
      ...(actor.role === 'WAREHOUSE'
        ? {
            distributionCenterLocationId:
              actor.operationalLocationId ?? '__warehouse_without_location__',
          }
        : {}),
      ...(actor.role === 'SELLER'
        ? {
            branchLocationId:
              actor.operationalLocationId ?? '__seller_without_location__',
          }
        : {}),
    };
  }

  private assertReceivable(
    link: IncomingSupplyLink,
    expectedCycleVersion: number,
  ): void {
    if (
      link.inventoryTransfer.status !== InventoryTransferStatus.REQUESTED &&
      link.inventoryTransfer.status !== InventoryTransferStatus.IN_TRANSIT
    ) {
      if (link.inventoryTransfer.branchSupplyReceipt) {
        throw new ConflictException('BRANCH_SUPPLY_RECEIPT_ALREADY_EXISTS');
      }
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
    }
    if (
      link.branchSupplyCycle.status === BranchSupplyCycleStatus.CLOSED ||
      link.branchSupplyCycle.status === BranchSupplyCycleStatus.CANCELLED
    ) {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
    }
    if (link.branchSupplyCycle.version !== expectedCycleVersion) {
      throw new ConflictException('BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT');
    }
    if (link.inventoryTransfer.branchSupplyReceipt) {
      throw new ConflictException('BRANCH_SUPPLY_RECEIPT_ALREADY_EXISTS');
    }
  }

  private normalizeReceiptItems(
    link: IncomingSupplyLink,
    dto: ReceiveIncomingSupplyDto,
  ): NormalizedReceiptItem[] {
    const transferItems = link.inventoryTransfer.items;
    const transferItemById = new Map(
      transferItems.map((item) => [item.id, item]),
    );
    const seen = new Set<string>();
    const normalized: NormalizedReceiptItem[] = [];

    for (const input of dto.items) {
      if (seen.has(input.transferItemId)) {
        throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
      }
      const transferItem = transferItemById.get(input.transferItemId);
      if (!transferItem) {
        throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
      }
      seen.add(input.transferItemId);
      const sentKg = this.toNumber(transferItem.quantityKg);
      const sentPieces = transferItem.quantityPieces ?? 0;
      const receivedKg = input.quantityKg ?? 0;
      const receivedPieces = input.quantityPieces ?? 0;
      this.assertReceivedQuantities(
        transferItem.unit,
        receivedKg,
        receivedPieces,
      );
      normalized.push({
        transferItemId: transferItem.id,
        productId: transferItem.productId,
        productName: transferItem.product.name,
        unit: transferItem.unit,
        sentKg,
        sentPieces,
        receivedKg,
        receivedPieces,
        differenceKg: this.round(receivedKg - sentKg),
        differencePieces: receivedPieces - sentPieces,
      });
    }

    if (seen.size !== transferItems.length) {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
    }
    return normalized;
  }

  private assertReceivedQuantities(
    unit: ProductUnit,
    quantityKg: number,
    quantityPieces: number,
  ): void {
    if (
      !Number.isFinite(quantityKg) ||
      !Number.isFinite(quantityPieces) ||
      quantityKg < 0 ||
      quantityPieces < 0 ||
      !Number.isInteger(quantityPieces)
    ) {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
    }
    if (unit === ProductUnit.KG && quantityPieces !== 0) {
      throw new BadRequestException('UNIT_MISMATCH');
    }
    if (unit === ProductUnit.PIECE && quantityKg !== 0) {
      throw new BadRequestException('UNIT_MISMATCH');
    }
  }

  private assertPermission(actor: ReceiptActor): void {
    if (!actor.permissions?.includes(PERMISSIONS.CEDIS_RECEIVE_SUPPLIES)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertLinkScope(link: IncomingSupplyLink, actor: ReceiptActor): void {
    if (actor.role === 'ADMIN') return;
    const allowed =
      (actor.role === 'WAREHOUSE' &&
        actor.operationalLocationId ===
          link.branchSupplyCycle.distributionCenterLocationId) ||
      (actor.role === 'SELLER' &&
        actor.operationalLocationId ===
          link.branchSupplyCycle.branchLocationId);
    if (!allowed) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
  }

  private toResponse(link: IncomingSupplyLink): IncomingSupplyResponse {
    const transfer = link.inventoryTransfer;
    const receipt = transfer.branchSupplyReceipt;
    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      cycleId: link.branchSupplyCycleId,
      cycleVersion: link.branchSupplyCycle.version,
      businessDate: this.dateOnly(link.branchSupplyCycle.businessDate),
      status: receipt ? 'RECEIVED' : 'PENDING',
      origin: this.toLocation(transfer.originLocation),
      destination: this.toLocation(transfer.destinationLocation),
      notes: transfer.notes,
      requestedAt: transfer.requestedAt?.toISOString() ?? null,
      confirmedAt: transfer.confirmedAt?.toISOString() ?? null,
      createdAt: transfer.createdAt.toISOString(),
      items: transfer.items.map((item) => ({
        transferItemId: item.id,
        productId: item.productId,
        productName: item.product.name,
        unit: item.unit,
        quantityKg: this.toNumber(item.quantityKg),
        quantityPieces: item.quantityPieces ?? 0,
      })),
      receipt: receipt
        ? {
            id: receipt.id,
            receivedAt: receipt.receivedAt.toISOString(),
            notes: receipt.notes,
            receivedBy: receipt.receivedBy,
            items: receipt.items.map((item) => ({
              transferItemId: item.transferItemId,
              productId: item.productId,
              productName: item.productNameSnapshot,
              unit: item.unit,
              sentKg: this.toNumber(item.sentKg),
              sentPieces: item.sentPieces,
              receivedKg: this.toNumber(item.receivedKg),
              receivedPieces: item.receivedPieces,
              differenceKg: this.toNumber(item.differenceKg),
              differencePieces: item.differencePieces,
            })),
          }
        : null,
    };
  }

  private toLocation(location: {
    id: string;
    name: string;
    code: string | null;
  }) {
    return { id: location.id, name: location.name, code: location.code };
  }

  private parseBusinessDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('INVALID_BUSINESS_DATE');
    }
    return date;
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private dateValue(value: Date): number {
    return value.getTime();
  }

  private normalizeText(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private hashPayload(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  private toNumber(value: Prisma.Decimal | number | string | null): number {
    return value === null ? 0 : Number(value);
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined;
        if ((code !== 'P2034' && code !== 'P2002') || attempt === 3) {
          if (code === 'P2034' || code === 'P2002') {
            throw new ConflictException({
              code: 'INVENTORY_CONCURRENCY_CONFLICT',
              message:
                'The inventory receipt could not be completed after concurrent retries',
            });
          }
          throw error;
        }
      }
    }
    throw new ConflictException({
      code: 'INVENTORY_CONCURRENCY_CONFLICT',
      message:
        'The inventory receipt could not be completed after concurrent retries',
    });
  }
}
