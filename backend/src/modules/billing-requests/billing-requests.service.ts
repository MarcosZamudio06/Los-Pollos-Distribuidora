import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingRequestStatus, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelBillingRequestDto, CreateBillingRequestDto, ListBillingRequestsQueryDto, UpdateBillingRequestDto } from './dto';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const transitions: Record<BillingRequestStatus, readonly BillingRequestStatus[]> = {
  REQUESTED: [BillingRequestStatus.IN_REVIEW, BillingRequestStatus.CANCELLED],
  IN_REVIEW: [BillingRequestStatus.APPROVED, BillingRequestStatus.REJECTED, BillingRequestStatus.CANCELLED],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

const detailInclude = {
  customer: true,
  sale: true,
  accountReceivable: true,
  requestedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  history: {
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: 'asc' as const },
  },
} satisfies Prisma.BillingRequestInclude;

@Injectable()
export class BillingRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListBillingRequestsQueryDto, actor: Actor) {
    const where = this.applyScope(this.buildWhere(query), actor);
    const [items, total] = await Promise.all([
      this.prisma.billingRequest.findMany({
        where,
        include: { customer: { select: { id: true, name: true } }, sale: { select: { id: true, saleNumber: true, locationId: true } } },
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.billingRequest.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toListItem(item)),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async findOne(id: string, actor: Actor) {
    const request = await this.prisma.billingRequest.findFirst({ where: this.applyScope({ id }, actor), include: detailInclude });
    if (!request) throw new NotFoundException('Billing request not found');
    return request;
  }

  async create(dto: CreateBillingRequestDto, actor: Actor) {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: dto.saleId },
        include: { billingRequest: { select: { id: true } }, accountReceivable: { select: { id: true } } },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status === SaleStatus.CANCELLED) throw new BadRequestException('Cancelled sales cannot receive billing requests');
      if (!sale.customerId) throw new BadRequestException('Sale must have a customer');
      if (sale.customerId !== dto.customerId) throw new BadRequestException('customerId must match the sale customer');
      if (sale.billingRequest) throw new ConflictException('Sale already has a billing request');
      if (actor.role === 'SELLER' && sale.userId !== actor.id) throw new ForbiddenException('SELLER can only create requests for own sales');

      const created = await tx.billingRequest.create({
        data: {
          saleId: sale.id,
          customerId: sale.customerId,
          requestedByUserId: actor.id,
          status: BillingRequestStatus.REQUESTED,
          reason: dto.reason.trim(),
          notes: this.optionalText(dto.notes),
          history: { create: { toStatus: BillingRequestStatus.REQUESTED, changedByUserId: actor.id, reason: dto.reason.trim(), notes: this.optionalText(dto.notes) } },
        },
        include: detailInclude,
      });

      if (sale.accountReceivable) {
        await tx.accountReceivable.update({ where: { id: sale.accountReceivable.id }, data: { billingRequestId: created.id } });
        return tx.billingRequest.findUnique({ where: { id: created.id }, include: detailInclude });
      }
      return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Sale already has a billing request');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBillingRequestDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.billingRequest.findUnique({ where: { id }, include: { sale: { select: { userId: true } } } });
      if (!current) throw new NotFoundException('Billing request not found');
      this.assertCanEdit(current.status, current.sale.userId, dto.status, actor);

      const nextStatus = dto.status;
      if (!nextStatus || nextStatus === current.status) {
        if (current.status !== BillingRequestStatus.REQUESTED) throw new BadRequestException('Only REQUESTED requests can edit reason or notes');
        return tx.billingRequest.update({
          where: { id },
          data: { ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}), ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}) },
          include: detailInclude,
        });
      }

      if (!transitions[current.status].includes(nextStatus)) {
        throw new BadRequestException(`Invalid billing request transition: ${current.status} to ${nextStatus}`);
      }
      const reason = dto.reason?.trim();
      if (!reason) throw new BadRequestException('reason is required for status transitions');

      await tx.billingRequestHistory.create({
        data: { billingRequestId: id, fromStatus: current.status, toStatus: nextStatus, changedByUserId: actor.id, reason, notes: this.optionalText(dto.notes) },
      });
      return tx.billingRequest.update({
        where: { id },
        data: { status: nextStatus, reviewedByUserId: actor.id, reviewedAt: new Date(), reason, notes: this.optionalText(dto.notes) },
        include: detailInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  cancel(id: string, dto: CancelBillingRequestDto, actor: Actor) {
    return this.update(id, { status: BillingRequestStatus.CANCELLED, reason: dto.reason, notes: dto.notes }, actor);
  }

  private buildWhere(query: ListBillingRequestsQueryDto): Prisma.BillingRequestWhereInput {
    return {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.locationId ? { sale: { locationId: query.locationId } } : {}),
      ...((query.dateFrom || query.dateTo) ? { requestedAt: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) } } : {}),
    };
  }

  private applyScope(where: Prisma.BillingRequestWhereInput, actor: Actor): Prisma.BillingRequestWhereInput {
    if (actor.role === 'ADMIN') return where;
    if (actor.role === 'SELLER') return { AND: [where, { sale: { userId: actor.id } }] };
    if (actor.role === 'COLLECTIONS') return { AND: [where, { accountReceivable: { isNot: null } }] };
    return { id: '__no_visible_request__' };
  }

  private assertCanEdit(status: BillingRequestStatus, saleUserId: string, nextStatus: BillingRequestStatus | undefined, actor: Actor) {
    if (actor.role === 'ADMIN') return;
    if (actor.role !== 'SELLER' || saleUserId !== actor.id) throw new ForbiddenException('Billing request is outside the user scope');
    if (status !== BillingRequestStatus.REQUESTED) throw new ForbiddenException('SELLER can only edit REQUESTED requests');
    if (nextStatus && nextStatus !== status) throw new ForbiddenException('SELLER cannot transition billing requests');
  }

  private toListItem(item: Record<string, any>) {
    return {
      id: item.id,
      customerId: item.customerId,
      customerName: item.customer?.name ?? null,
      saleId: item.saleId,
      saleNumber: item.sale?.saleNumber ?? null,
      locationId: item.sale?.locationId ?? null,
      requestedByUserId: item.requestedByUserId,
      reviewedByUserId: item.reviewedByUserId,
      status: item.status,
      requestedAt: item.requestedAt,
      reviewedAt: item.reviewedAt,
      reason: item.reason,
      notes: item.notes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private optionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }
}
