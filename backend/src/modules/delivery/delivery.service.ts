import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CollectionStatus,
  DeliveryEvidenceType,
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  InventoryMovementType,
  OperationalLocationType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RouteSettlementStatus,
  RouteOptimizationStatus,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateDeliveryRouteDto,
  AssignDeliveryRouteOrdersDto,
  CaptureDeliveryEvidenceDto,
  CloseRouteSettlementDto,
  ListDeliveryRoutesQueryDto,
  RegisterDeliveryIncidentDto,
  RegisterRouteCollectionDto,
  ReopenRouteSettlementDto,
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
  latitude?: DecimalLike;
  longitude?: DecimalLike;
  stopSequence?: number | null;
  legDistanceMeters?: number | null;
  legDurationSeconds?: number | null;
  sale?: { id: string; saleNumber: string; customer?: { name: string } | null } | null;
  accountReceivable?: { id: string; outstandingAmount?: DecimalLike } | null;
  evidence?: Array<{ type: string }>;
  route?: DeliveryRouteRecord | null;
};

type DeliveryEvidenceRecord = {
  id: string;
  deliveryOrderId: string;
  type: DeliveryEvidenceType;
  value: string;
  capturedAt: Date;
};

type RouteCollectionReceivable = {
  id: string;
  customerId: string;
  saleId: string;
  outstandingAmount: DecimalLike;
  status: CollectionStatus | string;
  dueDate?: Date;
};

type RoutePaymentRecord = {
  id: string;
  accountReceivableId?: string | null;
  customerId?: string | null;
  saleId?: string | null;
  routeId?: string | null;
  routeSettlementId?: string | null;
  amount: DecimalLike;
  paymentMethod: PaymentMethod | string;
  status: PaymentStatus | string;
  paidAt: Date;
  collectedByUserId?: string | null;
  collectionPass?: number | null;
};

type InventoryMovementRecord = {
  id: string;
  productId?: string;
  locationId: string;
  type?: InventoryMovementType | string;
  quantityKg?: DecimalLike;
  quantityPieces?: number | null;
  reason?: string | null;
};

type RouteSettlementRecord = {
  id: string;
  routeId: string;
  driverId: string;
  status: RouteSettlementStatus;
  version: number;
  expectedCashAmount: DecimalLike;
  expectedTransferAmount: DecimalLike;
  differenceAmount: DecimalLike;
  routeCollectionsSummary?: Prisma.JsonValue | null;
  paidAtDeliveryAmount: DecimalLike;
  overdueAmount: DecimalLike;
  secondPassCollectionsAmount: DecimalLike;
  closedAt?: Date | null;
  route?: { deliveryOrders?: DeliveryOrderRecord[] } | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type AssignableSaleRecord = {
  id: string;
  status: SaleStatus;
  accountReceivable?: { id: string } | null;
  routeId?: string | null;
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
  optimizationStatus?: RouteOptimizationStatus;
  geometry?: Prisma.JsonValue | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  optimizedAt?: Date | null;
  routingProfile?: string | null;
  routingDataVersion?: string | null;
  creationPayloadHash?: string | null;
};

type PlannedStop = {
  saleId: string;
  accountReceivableId?: string | null;
  deliveryAddress: string;
  latitude: number;
  longitude: number;
  geocoderOsmType?: string | null;
  geocoderOsmId?: string | null;
  sequence: number;
  legDistanceMeters: number;
  legDurationSeconds: number;
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
          orderBy: [{ stopSequence: 'asc' }, { createdAt: 'asc' }],
          include: {
            sale: { select: { id: true, saleNumber: true, customer: { select: { name: true } } } },
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

  async createRoute(dto: CreateDeliveryRouteDto, currentUser: Actor, idempotencyKey?: string) {
    if (currentUser.role !== 'ADMIN') {
      throw new NotFoundException('Delivery route not found');
    }

    if (dto.routePlanId) {
      if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key is required for optimized route creation');
      return this.createOptimizedRoute(dto, currentUser, idempotencyKey.trim());
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

  private async createOptimizedRoute(dto: CreateDeliveryRouteDto, currentUser: Actor, idempotencyKey: string) {
    const payloadHash = this.hashPayload({ ...dto, orders: undefined });
    return this.prisma.$transaction(async (tx) => {
      const existing = (await tx.deliveryRoute.findFirst({
        where: { creationIdempotencyKey: idempotencyKey },
        include: this.routeDetailInclude(),
      } as Prisma.DeliveryRouteFindFirstArgs)) as DeliveryRouteRecord | null;
      if (existing) {
        if (existing.creationPayloadHash !== payloadHash) throw new ConflictException('Idempotency-Key was already used with a different payload');
        return this.toRouteDetail(existing);
      }

      const plan = await tx.deliveryRoutePlanDraft.findFirst({ where: { id: dto.routePlanId, createdByUserId: currentUser.id } });
      if (!plan) throw new NotFoundException('Delivery route plan not found');
      if (plan.consumedAt || plan.expiresAt <= new Date()) throw new ConflictException('Delivery route plan is expired or already consumed');
      if (plan.sourceRouteId) throw new BadRequestException('A reoptimization plan cannot create a new route');
      if (plan.driverId !== dto.driverId || plan.originLocationId !== dto.originLocationId || plan.scheduledDate.toISOString().slice(0, 10) !== dto.scheduledDate.slice(0, 10)) {
        throw new ConflictException('Delivery route plan does not match the route context');
      }
      await this.assertDriver(tx, dto.driverId);
      const origin = await tx.operationalLocation.findFirst({ where: { id: dto.originLocationId, isActive: true, latitude: { not: null }, longitude: { not: null } }, select: { id: true } });
      if (!origin) throw new ConflictException('Route origin is no longer active or geocoded');
      const stops = plan.orderedStops as unknown as PlannedStop[];
      if (!Array.isArray(stops) || !stops.length) throw new ConflictException('Delivery route plan has no stops');
      const orders = stops.map((stop) => ({ saleId: stop.saleId, accountReceivableId: stop.accountReceivableId ?? undefined, deliveryAddress: stop.deliveryAddress }));
      await this.assertAssignableSales(tx, orders);
      const routeStockLocationId = dto.routeStockLocationId
        ? await this.resolveProvidedRouteStockLocation(tx, dto.routeStockLocationId)
        : await this.createRouteStockLocation(tx, dto.name);
      const now = new Date();
      const route = (await tx.deliveryRoute.create({
        data: {
          name: dto.name.trim(), driverId: dto.driverId, scheduledDate: new Date(dto.scheduledDate),
          originLocationId: dto.originLocationId, routeStockLocationId,
          optimizationStatus: RouteOptimizationStatus.OPTIMIZED, geometry: plan.geometry,
          distanceMeters: plan.distanceMeters, durationSeconds: plan.durationSeconds, optimizedAt: now,
          routingProfile: plan.routingProfile, routingDataVersion: plan.routingDataVersion,
          creationIdempotencyKey: idempotencyKey, creationPayloadHash: payloadHash,
          deliveryOrders: { create: stops.map((stop) => ({
            saleId: stop.saleId, accountReceivableId: stop.accountReceivableId ?? null,
            deliveryAddress: stop.deliveryAddress.trim(), latitude: stop.latitude, longitude: stop.longitude,
            geocoderOsmType: stop.geocoderOsmType ?? null, geocoderOsmId: stop.geocoderOsmId ?? null,
            stopSequence: stop.sequence, legDistanceMeters: stop.legDistanceMeters, legDurationSeconds: stop.legDurationSeconds,
          })) },
        },
        include: this.routeDetailInclude(),
      } as Prisma.DeliveryRouteCreateArgs)) as DeliveryRouteRecord;
      await tx.sale.updateMany({ where: { id: { in: stops.map((stop) => stop.saleId) }, routeId: null }, data: { routeId: route.id } });
      const consumed = await tx.deliveryRoutePlanDraft.updateMany({ where: { id: plan.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now, consumedByRouteId: route.id } });
      if (consumed.count !== 1) throw new ConflictException('Delivery route plan was consumed concurrently');
      return this.toRouteDetail(route);
    });
  }

  async assignOrdersToRoute(id: string, dto: AssignDeliveryRouteOrdersDto, currentUser: Actor) {
    if (currentUser.role !== 'ADMIN') {
      throw new NotFoundException('Delivery route not found');
    }

    if (dto.routePlanId) return this.assignOptimizedPlanToRoute(id, dto.routePlanId, currentUser);
    if (!dto.orders?.length) {
      throw new BadRequestException('At least one delivery order is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const route = (await tx.deliveryRoute.findFirst({
        where: this.buildRouteAccessWhere(id, currentUser),
        include: {
          settlement: { select: { id: true } },
          deliveryOrders: true,
        },
      } as Prisma.DeliveryRouteFindFirstArgs)) as DeliveryRouteRecord | null;

      if (!route) {
        throw new NotFoundException('Delivery route not found');
      }
      if (route.status === DeliveryRouteStatus.COMPLETED || route.status === DeliveryRouteStatus.CANCELLED) {
        throw new BadRequestException('Cannot assign orders to a completed or cancelled delivery route');
      }
      if (route.settlement?.id) {
        throw new BadRequestException('Cannot assign orders after route settlement has been opened');
      }
      if (route.optimizationStatus === RouteOptimizationStatus.OPTIMIZED) {
        throw new BadRequestException('Optimized routes require a combined reoptimization plan');
      }

      this.assertNoDuplicateRouteSales(route, dto.orders);
      await this.assertAssignableSales(tx, dto.orders, route.id);

      const updated = (await tx.deliveryRoute.update({
        where: { id: route.id },
        data: {
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
      } as Prisma.DeliveryRouteUpdateArgs)) as DeliveryRouteRecord;

      await tx.sale.updateMany({
        where: { id: { in: dto.orders.map((order) => order.saleId) } },
        data: { routeId: route.id },
      });

      return this.toRouteDetail(updated);
    });
  }

  private async assignOptimizedPlanToRoute(id: string, routePlanId: string, currentUser: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const route = (await tx.deliveryRoute.findFirst({
        where: this.buildRouteAccessWhere(id, currentUser),
        include: { settlement: { select: { id: true } }, deliveryOrders: true },
      } as Prisma.DeliveryRouteFindFirstArgs)) as DeliveryRouteRecord | null;
      if (!route) throw new NotFoundException('Delivery route not found');
      if (route.optimizationStatus !== RouteOptimizationStatus.OPTIMIZED) throw new BadRequestException('Historical routes must use the legacy orders payload');
      if (route.status !== DeliveryRouteStatus.PENDING || route.settlement?.id) throw new ConflictException('The route can no longer be reoptimized');
      const plan = await tx.deliveryRoutePlanDraft.findFirst({ where: { id: routePlanId, sourceRouteId: route.id, createdByUserId: currentUser.id } });
      if (!plan) throw new NotFoundException('Delivery route plan not found');
      const now = new Date();
      if (plan.consumedAt || plan.expiresAt <= now) throw new ConflictException('Delivery route plan is expired or already consumed');
      if (plan.driverId !== route.driverId || plan.originLocationId !== route.originLocationId || plan.scheduledDate.toISOString().slice(0, 10) !== route.scheduledDate.toISOString().slice(0, 10)) throw new ConflictException('Delivery route plan does not match the route context');
      const stops = plan.orderedStops as unknown as PlannedStop[];
      const existingBySale = new Map((route.deliveryOrders ?? []).map((order) => [order.saleId, order]));
      const plannedIds = new Set(stops.map((stop) => stop.saleId));
      const missing = [...existingBySale.keys()].filter((saleId) => !plannedIds.has(saleId));
      if (missing.length) throw new ConflictException('The reoptimization plan omits existing route stops');
      await this.assertAssignableSales(tx, stops.map((stop) => ({ saleId: stop.saleId, accountReceivableId: stop.accountReceivableId ?? undefined, deliveryAddress: stop.deliveryAddress })), route.id);

      await tx.deliveryOrder.updateMany({ where: { routeId: route.id }, data: { stopSequence: null } });
      for (const stop of stops.filter((candidate) => existingBySale.has(candidate.saleId))) {
        await tx.deliveryOrder.update({ where: { saleId: stop.saleId }, data: {
          accountReceivableId: stop.accountReceivableId ?? null, deliveryAddress: stop.deliveryAddress.trim(),
          latitude: stop.latitude, longitude: stop.longitude, geocoderOsmType: stop.geocoderOsmType ?? null,
          geocoderOsmId: stop.geocoderOsmId ?? null, stopSequence: stop.sequence,
          legDistanceMeters: stop.legDistanceMeters, legDurationSeconds: stop.legDurationSeconds,
        } });
      }
      const newStops = stops.filter((stop) => !existingBySale.has(stop.saleId));
      const updated = (await tx.deliveryRoute.update({ where: { id: route.id }, data: {
        geometry: plan.geometry, distanceMeters: plan.distanceMeters, durationSeconds: plan.durationSeconds,
        optimizedAt: now, routingProfile: plan.routingProfile, routingDataVersion: plan.routingDataVersion,
        deliveryOrders: { create: newStops.map((stop) => ({
          saleId: stop.saleId, accountReceivableId: stop.accountReceivableId ?? null, deliveryAddress: stop.deliveryAddress.trim(),
          latitude: stop.latitude, longitude: stop.longitude, geocoderOsmType: stop.geocoderOsmType ?? null,
          geocoderOsmId: stop.geocoderOsmId ?? null, stopSequence: stop.sequence,
          legDistanceMeters: stop.legDistanceMeters, legDurationSeconds: stop.legDurationSeconds,
        })) },
      }, include: this.routeDetailInclude() } as Prisma.DeliveryRouteUpdateArgs)) as DeliveryRouteRecord;
      if (newStops.length) await tx.sale.updateMany({ where: { id: { in: newStops.map((stop) => stop.saleId) }, routeId: null }, data: { routeId: route.id } });
      const consumed = await tx.deliveryRoutePlanDraft.updateMany({ where: { id: plan.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now, consumedByRouteId: route.id } });
      if (consumed.count !== 1) throw new ConflictException('Delivery route plan was consumed concurrently');
      return this.toRouteDetail(updated);
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

  async captureEvidence(id: string, dto: CaptureDeliveryEvidenceDto, currentUser: Actor) {
    const order = await this.findAccessibleOrder(id, currentUser);

    const evidence = (await this.prisma.deliveryEvidence.create({
      data: {
        deliveryOrderId: order.id,
        type: dto.type,
        value: dto.value.trim(),
        capturedAt: new Date(dto.capturedAt),
      },
    })) as DeliveryEvidenceRecord;

    return this.toEvidenceResponse(evidence);
  }

  async registerCollection(id: string, dto: RegisterRouteCollectionDto, currentUser: Actor) {
    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.findAccessibleOrder(id, currentUser, tx);
      if (!order.accountReceivableId || order.accountReceivableId !== dto.accountReceivableId) {
        throw new BadRequestException('Route collection must apply to the delivery order account receivable');
      }

      const receivable = (await tx.accountReceivable.findUnique({
        where: { id: dto.accountReceivableId },
      })) as RouteCollectionReceivable | null;

      if (!receivable) {
        throw new NotFoundException('Account receivable not found');
      }

      this.assertReceivableCanReceiveRoutePayment(receivable);
      const outstandingAmount = this.toNumber(receivable.outstandingAmount);
      if (dto.amount > outstandingAmount) {
        throw new BadRequestException('Payment amount cannot exceed outstanding balance');
      }

      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      const newOutstandingAmount = this.roundMoney(outstandingAmount - dto.amount);
      const nextStatus = newOutstandingAmount === 0 ? CollectionStatus.PAID : CollectionStatus.PARTIALLY_PAID;

      const existingSettlementId = order.route?.settlement?.id ?? null;
      const payment = (await tx.payment.create({
        data: {
          accountReceivableId: receivable.id,
          customerId: receivable.customerId,
          saleId: receivable.saleId,
          userId: currentUser.id,
          collectedByUserId: currentUser.id,
          collectionPass: dto.collectionPass ?? null,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          referenceNumber: dto.reference?.trim() || null,
          routeId: order.routeId,
          routeSettlementId: existingSettlementId,
          status: PaymentStatus.APPLIED,
          paidAt,
        },
      })) as RoutePaymentRecord;

      await tx.accountReceivable.update({
        where: { id: receivable.id },
        data: {
          outstandingAmount: newOutstandingAmount,
          status: nextStatus,
          lastPaymentDate: paidAt,
          paidAt: nextStatus === CollectionStatus.PAID ? paidAt : null,
        },
      });

      await tx.sale.update({
        where: { id: receivable.saleId },
        data: { collectionStatus: nextStatus },
      });

      const updatedOrder = (await tx.deliveryOrder.update({
        where: { id: order.id },
        data: {
          collectedByUserId: currentUser.id,
          collectionPass: dto.collectionPass ?? order.collectionPass ?? null,
        },
        include: {
          route: true,
          sale: { select: { id: true, saleNumber: true, customer: { select: { name: true } } } },
          accountReceivable: { select: { id: true, outstandingAmount: true } },
          evidence: { select: { type: true } },
        },
      } as Prisma.DeliveryOrderUpdateArgs)) as DeliveryOrderRecord;

      return {
        payment: this.toPaymentResponse(payment),
        deliveryOrder: {
          ...this.toOrderResponse(updatedOrder),
          derivedCollectedAmount: this.toNumber(payment.amount),
        },
      };
    });
  }

  async registerIncident(id: string, dto: RegisterDeliveryIncidentDto, currentUser: Actor) {
    if (!INCIDENT_STATUS_REQUIRING_NOTES.has(dto.status)) {
      throw new BadRequestException('Incident endpoint only accepts non-delivery, return, or partial rejection statuses');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.findAccessibleOrder(id, currentUser, tx);
      if (!order.route?.routeStockLocationId) {
        throw new BadRequestException('Route stock location is required to register delivery incidents');
      }

      const updatedOrder = (await tx.deliveryOrder.update({
        where: { id: order.id },
        data: {
          status: dto.status,
          notes: dto.reason.trim(),
        },
        include: {
          route: true,
          sale: { select: { id: true, saleNumber: true, customer: { select: { name: true } } } },
          accountReceivable: { select: { id: true, outstandingAmount: true } },
          evidence: { select: { type: true } },
        },
      } as Prisma.DeliveryOrderUpdateArgs)) as DeliveryOrderRecord;

      const inventoryMovements: InventoryMovementRecord[] = [];
      for (const item of dto.returnedItems ?? []) {
        const movement = await this.recordRouteReturnMovement(tx, {
          order,
          item,
          userId: currentUser.id,
          routeStockLocationId: order.route.routeStockLocationId,
          reason: item.reason || dto.reason,
        });
        inventoryMovements.push(movement);
      }

      return {
        deliveryOrder: this.toOrderResponse(updatedOrder),
        inventoryMovements: inventoryMovements.map((movement) => this.toInventoryMovementResponse(movement)),
      };
    });
  }

  async openSettlement(routeId: string, currentUser: Actor) {
    const route = (await this.prisma.deliveryRoute.findFirst({
      where: this.buildRouteAccessWhere(routeId, currentUser),
      include: {
        settlement: { select: { id: true } },
        payments: { where: { status: PaymentStatus.APPLIED } },
        deliveryOrders: {
          include: {
            accountReceivable: { select: { id: true, outstandingAmount: true } },
          },
        },
      },
    } as Prisma.DeliveryRouteFindFirstArgs)) as DeliveryRouteRecord | null;

    if (!route) {
      throw new NotFoundException('Delivery route not found');
    }

    this.assertSettlementPermissions(currentUser);
    this.assertRouteOrdersFinal(route);

    const summary = this.buildSettlementSummary(route);
    if (route.settlement?.id) {
      const existingSettlement = (await this.prisma.routeSettlement.findUnique({
        where: { id: route.settlement.id },
      })) as RouteSettlementRecord | null;
      if (existingSettlement) {
        return this.toSettlementResponse(existingSettlement, summary);
      }
    }

    const inventoryMovements = await this.prisma.inventoryMovement.findMany({
      where: { locationId: route.routeStockLocationId },
    });
    const settlementStatus = summary.differenceAmount !== 0 || (inventoryMovements as unknown[]).length > 0
      ? RouteSettlementStatus.REVIEW_REQUIRED
      : RouteSettlementStatus.OPEN;

    const settlement = (await this.prisma.routeSettlement.create({
      data: {
        routeId: route.id,
        driverId: route.driverId,
        status: settlementStatus,
        expectedCashAmount: summary.expectedAmount,
        expectedTransferAmount: 0,
        differenceAmount: summary.differenceAmount,
        paidAtDeliveryAmount: summary.collectedCashAmount,
        overdueAmount: summary.differenceAmount > 0 ? summary.differenceAmount : 0,
        secondPassCollectionsAmount: summary.secondPassCollectedAmount,
        routeCollectionsSummary: summary as unknown as Prisma.InputJsonValue,
      },
    })) as RouteSettlementRecord;

    return this.toSettlementResponse(settlement, summary);
  }

  async closeSettlement(id: string, dto: CloseRouteSettlementDto, currentUser: Actor, idempotencyKey?: string) {
    this.assertSettlementPermissions(currentUser);
    this.assertIdempotencyKey(idempotencyKey);
    const payloadHash = this.hashPayload(this.buildSettlementActionPayload('close', id, currentUser.id, dto));

    const settlement = (await this.prisma.routeSettlement.findUnique({
      where: { id },
      include: { route: { include: { deliveryOrders: true } } },
    })) as RouteSettlementRecord | null;

    if (!settlement) {
      throw new NotFoundException('Route settlement not found');
    }
    if (settlement.status === RouteSettlementStatus.CLOSED && this.hasMatchingSettlementIdempotency(settlement, 'close', idempotencyKey, payloadHash)) {
      return this.toSettlementResponse(settlement);
    }
    if (settlement.status === RouteSettlementStatus.CLOSED) {
      throw new BadRequestException('Route settlement is already closed');
    }
    if (settlement.version !== dto.expectedVersion) {
      throw new ConflictException('Route settlement version does not match expectedVersion');
    }

    this.assertRouteOrdersFinal({ deliveryOrders: settlement.route?.deliveryOrders ?? [] } as DeliveryRouteRecord);

    const closed = await this.updateSettlementVersioned({
      where: { id, version: dto.expectedVersion },
      data: {
        status: RouteSettlementStatus.CLOSED,
        closedAt: new Date(),
        notes: dto.notes?.trim() || null,
        routeCollectionsSummary: this.withSettlementIdempotency(settlement.routeCollectionsSummary, 'close', idempotencyKey, payloadHash),
        version: { increment: 1 },
      },
    });

    return this.toSettlementResponse(closed);
  }

  async reopenSettlement(id: string, dto: ReopenRouteSettlementDto, currentUser: Actor, idempotencyKey?: string) {
    this.assertSettlementPermissions(currentUser);
    this.assertIdempotencyKey(idempotencyKey);
    const payloadHash = this.hashPayload(this.buildSettlementActionPayload('reopen', id, currentUser.id, dto));

    const settlement = (await this.prisma.routeSettlement.findUnique({
      where: { id },
    })) as RouteSettlementRecord | null;

    if (!settlement) {
      throw new NotFoundException('Route settlement not found');
    }
    if (settlement.status === RouteSettlementStatus.OPEN && this.hasMatchingSettlementIdempotency(settlement, 'reopen', idempotencyKey, payloadHash)) {
      return this.toSettlementResponse(settlement);
    }
    if (settlement.status !== RouteSettlementStatus.CLOSED) {
      throw new BadRequestException('Only closed route settlements can be reopened');
    }
    if (settlement.version !== dto.expectedVersion) {
      throw new ConflictException('Route settlement version does not match expectedVersion');
    }

    const reopened = await this.updateSettlementVersioned({
      where: { id, version: dto.expectedVersion },
      data: {
        status: RouteSettlementStatus.OPEN,
        reopenedAt: new Date(),
        reopenedByUserId: currentUser.id,
        reopenedReason: dto.reason.trim(),
        closedAt: null,
        routeCollectionsSummary: this.withSettlementIdempotency(settlement.routeCollectionsSummary, 'reopen', idempotencyKey, payloadHash),
        version: { increment: 1 },
      },
    });

    return this.toSettlementResponse(reopened);
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

  private async findAccessibleOrder(
    id: string,
    currentUser: Actor,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const order = (await tx.deliveryOrder.findFirst({
      where: this.buildOrderAccessWhere(id, currentUser),
      include: {
        route: { include: { settlement: { select: { id: true } } } },
        sale: { select: { id: true, saleNumber: true } },
        accountReceivable: { select: { id: true, outstandingAmount: true } },
        evidence: { select: { type: true } },
      },
    } as Prisma.DeliveryOrderFindFirstArgs)) as DeliveryOrderRecord | null;

    if (!order) {
      throw new NotFoundException('Delivery order not found');
    }
    return order;
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

  private routeDetailInclude() {
    return {
      driver: { select: { id: true, name: true } },
      settlement: { select: { id: true } },
      payments: { where: { status: PaymentStatus.APPLIED } },
      deliveryOrders: {
        orderBy: [{ stopSequence: 'asc' as const }, { createdAt: 'asc' as const }],
        include: {
          sale: { select: { id: true, saleNumber: true, customer: { select: { name: true } } } },
          accountReceivable: { select: { id: true, outstandingAmount: true } },
          evidence: { select: { type: true } },
        },
      },
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

  private async assertAssignableSales(tx: Prisma.TransactionClient, orders: CreateDeliveryRouteDto['orders'], routeId?: string) {
    const saleIds = orders.map((order) => order.saleId);
    const uniqueSaleIds = [...new Set(saleIds)];
    if (uniqueSaleIds.length !== saleIds.length) {
      throw new BadRequestException('Duplicate sales cannot be assigned to the same route');
    }

    const sales = await tx.sale.findMany({
      where: { id: { in: uniqueSaleIds } },
      select: { id: true, status: true, routeId: true, accountReceivable: { select: { id: true } } },
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
      if (sale.routeId && sale.routeId !== routeId) {
        throw new BadRequestException('Sale is already assigned to another delivery route');
      }
      if (order.accountReceivableId && sale.accountReceivable?.id !== order.accountReceivableId) {
        throw new BadRequestException('Account receivable must belong to the assigned sale');
      }
    }
  }

  private assertNoDuplicateRouteSales(route: DeliveryRouteRecord, orders: CreateDeliveryRouteDto['orders']) {
    const existingSaleIds = new Set((route.deliveryOrders ?? []).map((order) => order.saleId));
    const duplicateSale = orders.find((order) => existingSaleIds.has(order.saleId));
    if (duplicateSale) {
      throw new BadRequestException('Sale is already assigned to this delivery route');
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
      optimizationStatus: route.optimizationStatus ?? RouteOptimizationStatus.NOT_OPTIMIZED,
      mapAvailable: route.optimizationStatus === RouteOptimizationStatus.OPTIMIZED && Boolean(route.geometry),
      distanceMeters: route.distanceMeters ?? null,
      durationSeconds: route.durationSeconds ?? null,
      optimizedAt: route.optimizedAt?.toISOString() ?? null,
      routingProfile: route.routingProfile ?? null,
      routingDataVersion: route.routingDataVersion ?? null,
      createdAt: route.createdAt.toISOString(),
    };
  }

  private toRouteDetail(route: DeliveryRouteRecord) {
    return {
      ...this.toRouteListItem(route),
      geometry: route.geometry ?? null,
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
      customerName: order.sale?.customer?.name ?? null,
      accountReceivableId: order.accountReceivableId ?? null,
      status: order.status,
      deliveryAddress: order.deliveryAddress,
      latitude: order.latitude == null ? null : this.toNumber(order.latitude),
      longitude: order.longitude == null ? null : this.toNumber(order.longitude),
      stopSequence: order.stopSequence ?? null,
      legDistanceMeters: order.legDistanceMeters ?? null,
      legDurationSeconds: order.legDurationSeconds ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      deliveredByUserId: order.deliveredByUserId ?? null,
      collectedByUserId: order.collectedByUserId ?? null,
      collectionPass: order.collectionPass ?? null,
      notes: order.notes ?? null,
    };
  }

  private toEvidenceResponse(evidence: DeliveryEvidenceRecord) {
    return {
      id: evidence.id,
      deliveryOrderId: evidence.deliveryOrderId,
      type: evidence.type,
      value: evidence.value,
      capturedAt: evidence.capturedAt.toISOString(),
    };
  }

  private toPaymentResponse(payment: RoutePaymentRecord) {
    return {
      id: payment.id,
      accountReceivableId: payment.accountReceivableId ?? null,
      customerId: payment.customerId ?? null,
      saleId: payment.saleId ?? null,
      routeId: payment.routeId ?? null,
      routeSettlementId: payment.routeSettlementId ?? null,
      amount: this.toNumber(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      paidAt: payment.paidAt.toISOString(),
      collectedByUserId: payment.collectedByUserId ?? null,
      collectionPass: payment.collectionPass ?? null,
    };
  }

  private toInventoryMovementResponse(movement: InventoryMovementRecord) {
    return {
      id: movement.id,
      productId: movement.productId,
      locationId: movement.locationId,
      type: movement.type,
      quantityKg: this.toNumber(movement.quantityKg),
      quantityPieces: movement.quantityPieces ?? 0,
      reason: movement.reason ?? null,
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

  private assertReceivableCanReceiveRoutePayment(receivable: RouteCollectionReceivable) {
    if (receivable.status === CollectionStatus.CANCELLED || receivable.status === CollectionStatus.PAID) {
      throw new BadRequestException('Account receivable cannot receive route collections');
    }
  }

  private async recordRouteReturnMovement(
    tx: Prisma.TransactionClient,
    params: {
      order: DeliveryOrderRecord;
      item: NonNullable<RegisterDeliveryIncidentDto['returnedItems']>[number];
      userId: string;
      routeStockLocationId: string;
      reason: string;
    },
  ) {
    const quantityKg = this.roundQuantity(params.item.quantityKg ?? 0);
    const quantityPieces = params.item.quantityPieces ?? 0;
    if (quantityKg <= 0 && quantityPieces <= 0) {
      throw new BadRequestException('Returned item quantity must be greater than 0');
    }

    const balance = await tx.inventoryBalance.upsert({
      where: {
        productId_locationId: {
          productId: params.item.productId,
          locationId: params.routeStockLocationId,
        },
      },
      update: {
        quantityKg: { increment: quantityKg },
        quantityPieces: { increment: quantityPieces },
      },
      create: {
        productId: params.item.productId,
        locationId: params.routeStockLocationId,
        quantityKg,
        quantityPieces,
      },
    });

    const newQuantityKg = this.toNumber((balance as { quantityKg?: DecimalLike }).quantityKg);
    const newQuantityPieces = (balance as { quantityPieces?: number }).quantityPieces ?? 0;
    const previousQuantityKg = this.roundQuantity(newQuantityKg - quantityKg);
    const previousQuantityPieces = newQuantityPieces - quantityPieces;

    return tx.inventoryMovement.create({
      data: {
        productId: params.item.productId,
        locationId: params.routeStockLocationId,
        userId: params.userId,
        type: InventoryMovementType.RETURN,
        quantity: quantityKg || quantityPieces,
        quantityKg,
        quantityPieces,
        previousStock: previousQuantityKg,
        newStock: newQuantityKg,
        previousQuantityKg,
        newQuantityKg,
        previousQuantityPieces,
        newQuantityPieces,
        reason: params.reason.trim(),
        referenceType: 'DeliveryOrder',
        referenceId: params.order.id,
        saleId: params.order.saleId,
      },
    }) as Promise<InventoryMovementRecord>;
  }

  private assertSettlementPermissions(currentUser: Actor) {
    if (!['ADMIN', 'COLLECTIONS'].includes(currentUser.role)) {
      throw new ForbiddenException('Only ADMIN or COLLECTIONS can manage route settlements');
    }
  }

  private assertRouteOrdersFinal(route: DeliveryRouteRecord) {
    const hasOpenOrders = (route.deliveryOrders ?? []).some((order) => !FINAL_ORDER_STATUSES.has(order.status));
    if (hasOpenOrders) {
      throw new BadRequestException('Cannot settle route with pending delivery orders');
    }
  }

  private buildSettlementSummary(route: DeliveryRouteRecord) {
    const expectedAmount = this.roundMoney(
      (route.deliveryOrders ?? []).reduce(
        (total, order) => total + this.toNumber(order.accountReceivable?.outstandingAmount),
        0,
      ),
    );
    const appliedPayments = (route.payments ?? []).filter((payment) => payment.status === PaymentStatus.APPLIED);
    const collectedCashAmount = this.roundMoney(
      appliedPayments
        .filter((payment) => payment.paymentMethod === PaymentMethod.CASH)
        .reduce((total, payment) => total + this.toNumber(payment.amount), 0),
    );
    const collectedTransferAmount = this.roundMoney(
      appliedPayments
        .filter((payment) => payment.paymentMethod === PaymentMethod.TRANSFER || payment.paymentMethod === PaymentMethod.DEPOSIT)
        .reduce((total, payment) => total + this.toNumber(payment.amount), 0),
    );
    const totalCollectedAmount = this.roundMoney(
      appliedPayments.reduce((total, payment) => total + this.toNumber(payment.amount), 0),
    );
    const secondPassCollectedAmount = this.roundMoney(
      appliedPayments
        .filter((payment) => payment.collectionPass === 2)
        .reduce((total, payment) => total + this.toNumber(payment.amount), 0),
    );

    return {
      expectedAmount,
      collectedCashAmount,
      collectedTransferAmount,
      totalCollectedAmount,
      secondPassCollectedAmount,
      deliveredOrdersCount: (route.deliveryOrders ?? []).filter((order) => order.status === DeliveryOrderStatus.DELIVERED).length,
      incidentOrdersCount: (route.deliveryOrders ?? []).filter((order) => order.status !== DeliveryOrderStatus.DELIVERED).length,
      differenceAmount: this.roundMoney(expectedAmount - totalCollectedAmount),
    };
  }

  private toSettlementResponse(settlement: RouteSettlementRecord, summary?: ReturnType<DeliveryService['buildSettlementSummary']>) {
    return {
      id: settlement.id,
      routeId: settlement.routeId,
      driverId: settlement.driverId,
      status: settlement.status,
      version: settlement.version,
      expectedCashAmount: this.toNumber(settlement.expectedCashAmount),
      derivedCollectedCashAmount: summary?.collectedCashAmount ?? this.toNumber(settlement.paidAtDeliveryAmount),
      expectedTransferAmount: this.toNumber(settlement.expectedTransferAmount),
      derivedCollectedTransferAmount: summary?.collectedTransferAmount ?? 0,
      differenceAmount: this.toNumber(settlement.differenceAmount),
      paidAtDeliveryAmount: this.toNumber(settlement.paidAtDeliveryAmount),
      overdueAmount: this.toNumber(settlement.overdueAmount),
      secondPassCollectionsAmount: this.toNumber(settlement.secondPassCollectionsAmount),
      closedAt: settlement.closedAt?.toISOString() ?? null,
    };
  }

  private async updateSettlementVersioned(args: Prisma.RouteSettlementUpdateArgs) {
    try {
      return (await this.prisma.routeSettlement.update(args)) as RouteSettlementRecord;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new ConflictException('Route settlement version does not match expectedVersion');
      }
      throw error;
    }
  }

  private assertIdempotencyKey(idempotencyKey?: string): asserts idempotencyKey is string {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
  }

  private buildSettlementActionPayload(
    action: 'close' | 'reopen',
    settlementId: string,
    userId: string,
    dto: CloseRouteSettlementDto | ReopenRouteSettlementDto,
  ) {
    return {
      action,
      settlementId,
      userId,
      expectedVersion: dto.expectedVersion,
      notes: 'notes' in dto ? dto.notes?.trim() ?? null : undefined,
      reason: 'reason' in dto ? dto.reason.trim() : undefined,
    };
  }

  private hashPayload(payload: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private withSettlementIdempotency(
    current: Prisma.JsonValue | null | undefined,
    action: 'close' | 'reopen',
    key: string,
    payloadHash: string,
  ): Prisma.InputJsonValue {
    const base = this.jsonObject(current);
    const idempotency = this.jsonObject(base.idempotency);
    const next = {
      ...base,
      idempotency: {
        ...idempotency,
        [action]: { key, payloadHash },
      },
    };
    return next as Prisma.InputJsonValue;
  }

  private hasMatchingSettlementIdempotency(
    settlement: RouteSettlementRecord,
    action: 'close' | 'reopen',
    key: string,
    payloadHash: string,
  ) {
    const summary = this.jsonObject(settlement.routeCollectionsSummary);
    const idempotency = this.jsonObject(summary.idempotency);
    const marker = this.jsonObject(idempotency[action]);
    return marker.key === key && marker.payloadHash === payloadHash;
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) return 0;
    return Number(value.toString());
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }
}
