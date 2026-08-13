import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchSupplyTransferRole,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InventoryTransfersService } from '../inventory/inventory-transfers.service';
import { ListBranchReturnsQueryDto } from './dto';

type ReturnActor = Pick<
  AuthenticatedUser,
  'id' | 'role' | 'operationalLocationId' | 'permissions'
>;

const RETURN_INCLUDE = {
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
      user: { select: { id: true, name: true } },
      items: { include: { product: true } },
    },
  },
} as const;

type ReturnLink = Prisma.BranchSupplyCycleTransferGetPayload<{
  include: typeof RETURN_INCLUDE;
}>;

export type BranchReturnResponse = {
  id: string;
  transferNumber: string;
  cycle: {
    id: string;
    version: number;
    businessDate: string;
    branch: { id: string; name: string; code: string | null };
    distributionCenter: { id: string; name: string; code: string | null };
  };
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string };
  items: Array<{
    transferItemId: string;
    productId: string;
    productName: string;
    unit: ProductUnit;
    quantityKg: number;
    quantityPieces: number;
  }>;
};

export type BranchReturnListResponse = {
  items: BranchReturnResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class BranchReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryTransfers: InventoryTransfersService,
  ) {}

  async list(
    query: ListBranchReturnsQueryDto,
    actor: ReturnActor,
  ): Promise<BranchReturnListResponse> {
    this.assertReadPermission(actor);
    const links = (await this.prisma.branchSupplyCycleTransfer.findMany({
      where: {
        role: BranchSupplyTransferRole.RETURN,
        branchSupplyCycle: { is: this.buildCycleScope(query, actor) },
      },
      include: RETURN_INCLUDE,
      orderBy: { linkedAt: 'desc' },
    })) as ReturnLink[];
    const filtered = links.filter((link) =>
      this.matchesStatus(link, query.status),
    );
    filtered.sort((left, right) => {
      const statusDifference =
        this.statusWeight(left) - this.statusWeight(right);
      if (statusDifference !== 0) return statusDifference;
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
    actor: ReturnActor,
  ): Promise<BranchReturnResponse> {
    this.assertReadPermission(actor);
    const link = await this.findLink(this.prisma, transferId);
    this.assertLinkReadScope(link, actor);
    return this.toResponse(link);
  }

  async complete(
    transferId: string,
    actor: ReturnActor,
    idempotencyKey: string,
  ): Promise<BranchReturnResponse> {
    this.assertCompletionPermission(actor);
    const key = idempotencyKey.trim();
    if (!key)
      throw new BadRequestException('Idempotency-Key header is required');
    const link = await this.findLink(this.prisma, transferId);
    this.assertCompletionScope(link, actor);
    await this.inventoryTransfers.confirm(transferId, actor.id, key, { actor });
    return this.toResponse(await this.findLink(this.prisma, transferId));
  }

  private async findLink(
    client: PrismaService | Prisma.TransactionClient,
    transferId: string,
  ): Promise<ReturnLink> {
    const link = await client.branchSupplyCycleTransfer.findUnique({
      where: { inventoryTransferId: transferId },
      include: RETURN_INCLUDE,
    });
    if (!link || link.role !== BranchSupplyTransferRole.RETURN) {
      throw new NotFoundException('BRANCH_RETURN_NOT_FOUND');
    }
    return link as ReturnLink;
  }

  private buildCycleScope(
    query: ListBranchReturnsQueryDto,
    actor: ReturnActor,
  ): Prisma.BranchSupplyCycleWhereInput {
    const scopedLocationId =
      actor.operationalLocationId ?? '__location_not_assigned__';
    return {
      businessDate: this.parseBusinessDate(query.businessDate),
      ...(query.branchLocationId
        ? { branchLocationId: query.branchLocationId }
        : {}),
      ...(actor.role === 'WAREHOUSE'
        ? {
            OR: [
              { distributionCenterLocationId: scopedLocationId },
              { branchLocationId: scopedLocationId },
            ],
          }
        : {}),
      ...(actor.role === 'SELLER'
        ? { branchLocationId: scopedLocationId }
        : {}),
    };
  }

  private assertReadPermission(actor: ReturnActor): void {
    if (!actor.permissions?.includes(PERMISSIONS.CEDIS_VIEW)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertCompletionPermission(actor: ReturnActor): void {
    if (
      (actor.role !== 'ADMIN' && actor.role !== 'WAREHOUSE') ||
      !actor.permissions?.includes(PERMISSIONS.CEDIS_RECEIVE_RETURNS)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertLinkReadScope(link: ReturnLink, actor: ReturnActor): void {
    if (actor.role === 'ADMIN') return;
    const cycle = link.branchSupplyCycle;
    const allowed =
      (actor.role === 'SELLER' &&
        actor.operationalLocationId === cycle.branchLocationId) ||
      (actor.role === 'WAREHOUSE' &&
        (actor.operationalLocationId === cycle.branchLocationId ||
          actor.operationalLocationId === cycle.distributionCenterLocationId));
    if (!allowed) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
  }

  private assertCompletionScope(link: ReturnLink, actor: ReturnActor): void {
    if (actor.role === 'ADMIN') return;
    if (
      actor.operationalLocationId !==
      link.branchSupplyCycle.distributionCenterLocationId
    ) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
  }

  private matchesStatus(link: ReturnLink, status?: string): boolean {
    return !status || status === 'ALL' || this.status(link) === status;
  }

  private status(link: ReturnLink): BranchReturnResponse['status'] {
    switch (link.inventoryTransfer.status) {
      case InventoryTransferStatus.CONFIRMED:
        return 'COMPLETED';
      case InventoryTransferStatus.CANCELLED:
        return 'CANCELLED';
      default:
        return 'PENDING';
    }
  }

  private statusWeight(link: ReturnLink): number {
    return { PENDING: 0, COMPLETED: 1, CANCELLED: 2 }[this.status(link)];
  }

  private toResponse(link: ReturnLink): BranchReturnResponse {
    const transfer = link.inventoryTransfer;
    const cycle = link.branchSupplyCycle;
    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      cycle: {
        id: cycle.id,
        version: cycle.version,
        businessDate: this.dateOnly(cycle.businessDate),
        branch: this.toLocation(cycle.branchLocation),
        distributionCenter: this.toLocation(cycle.distributionCenterLocation),
      },
      status: this.status(link),
      notes: transfer.notes,
      requestedAt: transfer.requestedAt?.toISOString() ?? null,
      confirmedAt: transfer.confirmedAt?.toISOString() ?? null,
      cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
      createdAt: transfer.createdAt.toISOString(),
      requestedBy: transfer.user,
      items: transfer.items.map((item) => ({
        transferItemId: item.id,
        productId: item.productId,
        productName: item.product.name,
        unit: item.unit,
        quantityKg: this.toNumber(item.quantityKg),
        quantityPieces: item.quantityPieces ?? 0,
      })),
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
  private toNumber(value: Prisma.Decimal | number | string | null): number {
    return value === null ? 0 : Number(value);
  }
}
