import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  OperationalLocationType,
  PaymentStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateDeliveryRouteDto,
  ListDeliveryRoutesQueryDto,
  UpdateDeliveryOrderStatusDto,
  UpdateDeliveryRouteStatusDto,
} from './dto';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;
type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type DeliveryOrderRecord = Record<string, unknown> & {
  id: string;
  routeId: string;
  saleId: string;
  accountReceivableId?: string | null;
  status: DeliveryOrderStatus;
  deliveryAddress: string;
  deliveredAt?: Date | null;
  deliveredByUserId?: string | null;
  collectedByUserId?: string | null;
  collectionPass?: number | null;
  notes?: string | null;
  sale?: { id: string; saleNumber: string } | null;
  accountReceivable?: { id: string; outstandingAmount?: DecimalLike } | null;
  evidence?: Array<{ type: string }>;
  route?: DeliveryRouteRecord | null;
};

type AssignableSaleRecord = {
  id: string;
  status: SaleStatus;
  accountReceivable?: { id: string } | null;
};

type PaymentSummaryRecord = {
  amount: DecimalLike;
  paymentMethod: string;
  collectionPass?: number | null;
  status?: PaymentStatus | string;
};

type DeliveryRouteRecord = Record<string, unknown> & {
  id: string;
  name: string;
  driverId: string;
  driver?: { id: string; name: string } | null;
  status: DeliveryRouteStatus;
  scheduledDate: Date;
  originLocationId?: string | null;
  routeStockLocationId: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  deliveryOrders?: DeliveryOrderRecord[];
  settlement?: { id: string } | null;
  payments?: PaymentSummaryRecord[];
};

const FINAL_ORDER_STATUSES = new Set<DeliveryOrderStatus>([
  DeliveryOrderStatus.DELIVERED,
  DeliveryOrderStatus.NOT_DELIVERED,
  DeliveryOrderStatus.CANCELLED,
  DeliveryOrderStatus.PARTIALLY_REJECTED,
  DeliveryOrderStatus.RETURNED,
]);

const INCIDENT_STATUS_REQUIRING_NOTES = new Set<DeliveryOrderStatus>([
  DeliveryOrderStatus.NOT_DELIVERED,
  DeliveryOrderStatus.PARTIALLY_REJECTED,
  DeliveryOrderStatus.RETURNED,
]);

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async findRoutes(query: ListDeliveryRoutesQueryDto = {}, currentUser: Actor) {
    const where = this.buildRouteWhere(query, currentUser);
    const pagination = this.buildPagination(query);
    const [total, routes] = await Promise.all([
      this.prisma.deliveryRoute.count({ where }),
      this.prisma.deliveryRoute.findMany({
        where,
        include: this.routeListInclude(),
        orderBy: { scheduledDate: 'desc' },
        ...pagination,
      } as Prisma.DeliveryRouteFindManyArgs),
    ]) as [number, DeliveryRouteRecord[]];

    const page = query.page ?? 1;
    const limit = query.limit ?? total;

    return {
      items: routes.map((route) => this.toRouteListItem(route)),
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }

  async findRoute(id: string, currentUser: Actor) {
    const route = (await this.prisma.deliveryRoute.findFirst({
      where: this.buildRouteAccessWhere(id, currentUser),
      include: {
        driver: { select: { id: true, name: true } },
        settlement: { select: { id: true } },
        payments: { where: { status: PaymentStatus.APPLIED } },
        deliveryOrders: {
          orderBy: { createdAt: 'asc' },
          include: {
            sale: { select: { id: true, saleNumber: true } },
            accountReceivable: { select: { id: true, outstandingAmount: true } },
            evidence: { select: { type: true } },
          },
        },
      },
    } as Prisma.DeliveryRouteFindFirstArgs)) as DeliveryRouteRecord | null;

    if (!route) {
      throw new NotFoundException('Delivery route not found');
    }

    return this.toRouteDetail(route);
  }

  async createRoute(dto: CreateDeliveryRouteDto, currentUser: Actor) {
    if (currentUser.role !== 'ADMIN') {
      throw new NotFoundException('Delivery route not found');
    }

    if (!dto.orders?.length) {
      throw new BadRequestException('At least one delivery order is required');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertDriver(tx, dto.driverId);
      await this.assertAssignableSales(tx, dto.orders);

      const routeStockLocationId = dto.routeStockLocationId
        ? await this.resolveProvidedRouteStockLocation(tx, dto.routeStockLocationId)
        : await this.createRouteStockLocation(tx, dto.name);

      const route = (await tx.deliveryRoute.create({
        data: {
          name: dto.name.trim(),
          driverId: dto.driverId,
          scheduledDate: new Date(dto.scheduledDate),
          originLocationId: dto.originLocationId ?? null,
          routeStockLocationId,
          deliveryOrders: {
            create: dto.orders.map((order) => ({
              saleId: order.saleId,
              accountReceivableId: order.accountReceivableId ?? null,
              deliveryAddress: order.deliveryAddress.trim(),
            })),
          },
        },
        include: {
          driver: { select: { id: true, name: true } },
          settlement: { select: { id: true } },
          payments: { where: { status: PaymentStatus.APPLIED } },
          deliveryOrders: {
            orderBy: { createdAt: 'asc' },
            include: {
              sale: { select: { id: true, saleNumber: true } },
              accountReceivable: { select: { id: true, outstandingAmount: true } },
              evidence: { select: { type: true } },
            },
          },
        },
      } as Prisma.DeliveryRouteCreateArgs)) as DeliveryRouteRecord;

      await tx.sale.updateMany({
        where: { id: { in: dto.orders.map((order) => order.saleId) } },
        data: { routeId: route.id },
      });

      return this.toRouteDetail(route);
    });
  }

  async updateRouteStatus(id: string, dto: UpdateDeliveryRouteStatusDto, currentUser: Actor) {
    const route = (await this.prisma.deliveryRoute.findFirst({
      where: this.buildRouteAccessWhere(id, currentUser),
      include: { deliveryOrders: true },
    } as Prisma.DeliveryRouteFindFirstArgs)) as DeliveryRouteRecord | null;

    if (!route) {
      throw new NotFoundException('Delivery route not found');
    }

    this.assertRouteStatusTransition(route, dto.status, currentUser);

    if (dto.status === DeliveryRouteStatus.COMPLETED) {
      const hasOpenOrders = (route.deliveryOrders ?? []).some((order) => !FINAL_ORDER_STATUSES.has(order.status));
      if (hasOpenOrders) {
        throw new BadRequestException('Cannot complete route with pending delivery orders');
      }
    }

    const now = new Date();
    const updated = (await this.prisma.deliveryRoute.update({
      where: { id: route.id },
      data: {
        status: dto.status,
        ...(dto.status === DeliveryRouteStatus.IN_PROGRESS && !route.startedAt ? { startedAt: now } : {}),
        ...(dto.status === DeliveryRouteStatus.COMPLETED && !route.completedAt ? { completedAt: now } : {}),
      },
      include: this.routeListInclude(),
    } as Prisma.DeliveryRouteUpdateArgs)) as DeliveryRouteRecord;

    return this.toRouteListItem(updated);
  }

  async updateOrderStatus(id: string, dto: UpdateDeliveryOrderStatusDto, currentUser: Actor) {
    if (INCIDENT_STATUS_REQUIRING_NOTES.has(dto.status) && !dto.notes?.trim()) {
      throw new BadRequestException('notes is required for delivery incident, return, or rejection statuses');
    }

    const order = (await this.prisma.deliveryOrder.findFirst({
      where: this.buildOrderAccessWhere(id, currentUser),
      include: {
        route: true,
        sale: { select: { id: true, saleNumber: true } },
        accountReceivable: { select: { id: true, outstandingAmount: true } },
        evidence: { select: { type: true } },
      },
    } as Prisma.DeliveryOrderFindFirstArgs)) as DeliveryOrderRecord | null;

    if (!order) {
      throw new NotFoundException('Delivery order not found');
    }

    if (!order.route?.routeStockLocationId) {
      throw new BadRequestException('Route stock location is required to update delivery order status');
    }

    const deliveredAt = dto.status === DeliveryOrderStatus.DELIVERED ? new Date(dto.deliveredAt ?? Date.now()) : undefined;
    const updated = (await this.prisma.deliveryOrder.update({
      where: { id: order.id },
      data: {
        status: dto.status,
        notes: dto.notes?.trim() ?? order.notes ?? null,
        ...(deliveredAt ? { deliveredAt, deliveredByUserId: currentUser.id } : {}),
      },
      include: {
        route: true,
        sale: { select: { id: true, saleNumber: true } },
        accountReceivable: { select: { id: true, outstandingAmount: true } },
        evidence: { select: { type: true } },
      },
    } as Prisma.DeliveryOrderUpdateArgs)) as DeliveryOrderRecord;

    return this.toOrderResponse(updated);
  }

  private buildRouteWhere(query: ListDeliveryRoutesQueryDto, currentUser: Actor): Prisma.DeliveryRouteWhereInput {
    return {
      ...(currentUser.role === 'DRIVER' ? { driverId: currentUser.id } : query.driverId ? { driverId: query.driverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.originLocationId ? { originLocationId: query.originLocationId } : {}),
      ...(query.scheduledDate ? { scheduledDate: this.buildDateFilter(query.scheduledDate) } : {}),
    };
  }

  private buildRouteAccessWhere(id: string, currentUser: Actor): Prisma.DeliveryRouteWhereInput {
    return {
      id,
      ...(currentUser.role === 'DRIVER' ? { driverId: currentUser.id } : {}),
    };
  }

  private buildOrderAccessWhere(id: string, currentUser: Actor): Prisma.DeliveryOrderWhereInput {
    return {
      id,
      ...(currentUser.role === 'DRIVER' ? { route: { driverId: currentUser.id } } : {}),
    };
  }

  private buildPagination(query: ListDeliveryRoutesQueryDto): { skip?: number; take?: number } {
    if (!query.limit) {
      return {};
    }

    return {
      skip: ((query.page ?? 1) - 1) * query.limit,
      take: query.limit,
    };
  }

  private buildDateFilter(value: string) {
    const start = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start, lt: end };
  }

  private routeListInclude() {
    return {
      driver: { select: { id: true, name: true } },
      settlement: { select: { id: true } },
      deliveryOrders: true,
    };
  }

  private async resolveProvidedRouteStockLocation(tx: Prisma.TransactionClient, routeStockLocationId: string) {
    const location = await tx.operationalLocation.findFirst({
      where: { id: routeStockLocationId, type: OperationalLocationType.ROUTE_STOCK, isActive: true },
    });
    if (!location) {
      throw new NotFoundException('Route stock location not found');
    }
    const existingRoute = await tx.deliveryRoute.findFirst({
      where: { routeStockLocationId },
      select: { id: true },
    });
    if (existingRoute) {
      throw new BadRequestException('Route stock location is already assigned to another delivery route');
    }
    return routeStockLocationId;
  }

  private async createRouteStockLocation(tx: Prisma.TransactionClient, routeName: string) {
    const location = await tx.operationalLocation.create({
      data: {
        name: `${routeName.trim()} Stock`,
        type: OperationalLocationType.ROUTE_STOCK,
        isActive: true,
      },
    });
    return location.id;
  }

  private async assertDriver(tx: Prisma.TransactionClient, driverId: string) {
    const driver = await tx.user.findFirst({
      where: { id: driverId, isActive: true, role: { name: 'DRIVER' } },
      select: { id: true },
    });
    if (!driver) {
      throw new BadRequestException('Assigned driver must be an active DRIVER user');
    }
  }

  private async assertAssignableSales(tx: Prisma.TransactionClient, orders: CreateDeliveryRouteDto['orders']) {
    const saleIds = orders.map((order) => order.saleId);
    const uniqueSaleIds = [...new Set(saleIds)];
    if (uniqueSaleIds.length !== saleIds.length) {
      throw new BadRequestException('Duplicate sales cannot be assigned to the same route');
    }

    const sales = await tx.sale.findMany({
      where: { id: { in: uniqueSaleIds } },
      select: { id: true, status: true, accountReceivable: { select: { id: true } } },
    }) as AssignableSaleRecord[];
    const salesById = new Map(sales.map((sale) => [sale.id, sale]));

    for (const order of orders) {
      const sale = salesById.get(order.saleId);
      if (!sale) {
        throw new NotFoundException(`Sale ${order.saleId} not found`);
      }
      if (sale.status !== SaleStatus.CONFIRMED) {
        throw new BadRequestException('Only confirmed non-cancelled sales can be assigned to delivery routes');
      }
      if (order.accountReceivableId && sale.accountReceivable?.id !== order.accountReceivableId) {
        throw new BadRequestException('Account receivable must belong to the assigned sale');
      }
    }
  }

  private assertRouteStatusTransition(route: DeliveryRouteRecord, targetStatus: DeliveryRouteStatus, currentUser: Actor) {
    if (currentUser.role === 'DRIVER') {
      const allowedDriverStatuses = new Set<DeliveryRouteStatus>([
        DeliveryRouteStatus.IN_PROGRESS,
        DeliveryRouteStatus.COMPLETED,
      ]);
      if (!allowedDriverStatuses.has(targetStatus)) {
        throw new ForbiddenException('Drivers can only start or complete their own delivery routes');
      }
    }

    if (route.status === DeliveryRouteStatus.COMPLETED && targetStatus !== DeliveryRouteStatus.COMPLETED) {
      throw new BadRequestException('Completed delivery routes cannot be reopened');
    }
  }

  private toRouteListItem(route: DeliveryRouteRecord) {
    const orders = route.deliveryOrders ?? [];
    return {
      id: route.id,
      name: route.name,
      driverId: route.driverId,
      driverName: route.driver?.name ?? null,
      status: route.status,
      scheduledDate: route.scheduledDate.toISOString(),
      originLocationId: route.originLocationId ?? null,
      routeStockLocationId: route.routeStockLocationId,
      startedAt: route.startedAt?.toISOString() ?? null,
      completedAt: route.completedAt?.toISOString() ?? null,
      ordersCount: orders.length,
      pendingOrdersCount: orders.filter((order) => !FINAL_ORDER_STATUSES.has(order.status)).length,
      routeSettlementId: route.settlement?.id ?? null,
      createdAt: route.createdAt.toISOString(),
    };
  }

  private toRouteDetail(route: DeliveryRouteRecord) {
    return {
      ...this.toRouteListItem(route),
      orders: (route.deliveryOrders ?? []).map((order) => this.toOrderResponse(order)),
      evidenceSummary: (route.deliveryOrders ?? []).flatMap((order) =>
        (order.evidence ?? []).map((evidence) => ({ deliveryOrderId: order.id, type: evidence.type })),
      ),
      collectionsSummary: this.buildCollectionsSummary(route.payments ?? [], route.deliveryOrders ?? []),
    };
  }

  private toOrderResponse(order: DeliveryOrderRecord) {
    return {
      id: order.id,
      saleId: order.saleId,
      saleNumber: order.sale?.saleNumber ?? null,
      accountReceivableId: order.accountReceivableId ?? null,
      status: order.status,
      deliveryAddress: order.deliveryAddress,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      deliveredByUserId: order.deliveredByUserId ?? null,
      collectedByUserId: order.collectedByUserId ?? null,
      collectionPass: order.collectionPass ?? null,
      notes: order.notes ?? null,
    };
  }

  private buildCollectionsSummary(payments: PaymentSummaryRecord[], orders: DeliveryOrderRecord[] = []) {
    const expectedAmount = orders.reduce((total, order) => {
      return total + Number(order.accountReceivable?.outstandingAmount?.toString() ?? 0);
    }, 0);

    return payments.reduce(
      (summary, payment) => {
        const amount = Number(payment.amount?.toString() ?? 0);
        const method = payment.paymentMethod;
        summary.collectedByMethod[method] = (summary.collectedByMethod[method] ?? 0) + amount;
        if (payment.collectionPass === 2) {
          summary.secondPassCollectedAmount += amount;
        } else {
          summary.firstPassCollectedAmount += amount;
        }
        summary.totalCollectedAmount += amount;
        return summary;
      },
      {
        expectedAmount,
        totalCollectedAmount: 0,
        firstPassCollectedAmount: 0,
        secondPassCollectedAmount: 0,
        collectedByMethod: {} as Record<string, number>,
      },
    );
  }
}
