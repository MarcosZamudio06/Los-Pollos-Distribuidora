import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CollectionStatus,
  DeliveryIncidentStatus,
  DeliveryIncidentType,
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
import { InventoryBalanceService } from '../inventory/inventory-balance.service';
import { FleetGateway } from '../fleet/fleet.gateway';
import type { FleetIncidentCreatedPayload } from '../fleet/fleet-realtime.types';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../object-storage/object-storage.port';
import { calculateReceivableAging } from '../accounts-receivable/receivable-aging';
import { Money } from '../../../../shared/money';
import {
  validateDeliveryEvidence,
  type ValidatedDeliveryEvidence,
} from './delivery-evidence.validation';
import { buildDeliveryEvidenceStorageKey } from './delivery-evidence-storage';
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

type Actor = Pick<AuthenticatedUser, 'id' | 'role' | 'permissions'>;
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
  sale?: {
    id: string;
    saleNumber: string;
    customer?: { name: string } | null;
  } | null;
  accountReceivable?: {
    id: string;
    outstandingAmount?: DecimalLike;
    version?: number;
  } | null;
  evidence?: Array<{
    id?: string;
    type: string;
    value?: string | null;
    capturedAt?: Date | null;
    storageKey?: string | null;
    mimeType?: string | null;
    sha256?: string | null;
    sizeBytes?: number | null;
    receivedAt?: Date | null;
    capturedByUserId?: string | null;
    metadata?: Prisma.JsonValue | null;
  }>;
  route?: DeliveryRouteRecord | null;
};

type DeliveryEvidenceRecord = {
  id: string;
  deliveryOrderId: string;
  type: DeliveryEvidenceType;
  value: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  sha256?: string | null;
  sizeBytes?: number | null;
  capturedAt: Date;
  receivedAt?: Date | null;
  capturedByUserId?: string | null;
  metadata?: Prisma.JsonValue | null;
};

type IncidentPositionRecord = {
  id: string;
  latitude: DecimalLike;
  longitude: DecimalLike;
  recordedAt: Date;
};

type DeliveryIncidentRecord = Record<string, unknown> & {
  id: string;
  type: DeliveryIncidentType;
  status: DeliveryIncidentStatus;
  reason: string;
  details?: string | null;
  routeId?: string | null;
  deliveryOrderId?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  positionId?: string | null;
  statusSnapshot: DeliveryOrderStatus;
  latitude?: DecimalLike;
  longitude?: DecimalLike;
  zoneId?: string | null;
  returnedItems?: Prisma.JsonValue | null;
  evidence?: Prisma.JsonValue | null;
  resolution?: string | null;
  occurredAt: Date;
  reportedAt: Date;
  reportedByUserId: string;
  resolvedAt?: Date | null;
  resolvedByUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RouteCollectionReceivable = {
  id: string;
  customerId: string;
  saleId: string;
  outstandingAmount: DecimalLike;
  status: CollectionStatus;
  dueDate: Date;
  version: number;
};

type RoutePaymentRecord = {
  id: string;
  accountReceivableId?: string | null;
  customerId?: string | null;
  saleId?: string | null;
  routeId?: string | null;
  routeSettlementId?: string | null;
  amount: DecimalLike;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paidAt: Date | string;
  collectedByUserId?: string | null;
  collectionPass?: number | null;
  idempotencyPayloadHash?: string | null;
};

type InventoryMovementRecord = {
  id: string;
  productId?: string;
  locationId: string;
  type?: InventoryMovementType;
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

type VehicleSummary = {
  id: string;
  code: string;
  displayName: string;
  plateNumber: string | null;
};

type AssignableSaleRecord = {
  id: string;
  status: SaleStatus;
  accountReceivable?: { id: string } | null;
  routeId?: string | null;
};

type PaymentSummaryRecord = {
  accountReceivableId?: string | null;
  amount: DecimalLike;
  paymentMethod: PaymentMethod;
  collectionPass?: number | null;
  status?: PaymentStatus;
};

type DeliveryRouteRecord = Record<string, unknown> & {
  id: string;
  name: string;
  driverId: string;
  driver?: { id: string; name: string } | null;
  vehicleId?: string | null;
  vehicle?: VehicleSummary | null;
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

const REQUIRED_DELIVERY_EVIDENCE_TYPES: DeliveryEvidenceType[] = [
  DeliveryEvidenceType.PHOTO,
  DeliveryEvidenceType.GEOLOCATION,
];

const INCIDENT_POSITION_MAX_AGE_MS = 5 * 60 * 1000;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: InventoryBalanceService,
    @Optional() private readonly fleetGateway?: FleetGateway,
    @Optional()
    @Inject(OBJECT_STORAGE)
    private readonly objectStorage?: ObjectStoragePort,
  ) {}

  async findRoutes(query: ListDeliveryRoutesQueryDto = {}, currentUser: Actor) {
    const where = this.buildRouteWhere(query, currentUser);
    const pagination = this.buildPagination(query);
    const [total, routes] = (await Promise.all([
      this.prisma.deliveryRoute.count({ where }),
      this.prisma.deliveryRoute.findMany({
        where,
        include: this.routeListInclude(),
        orderBy: { scheduledDate: 'desc' },
        ...pagination,
      }),
    ])) as [number, DeliveryRouteRecord[]];

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
      include: this.routeDetailInclude(),
    })) as DeliveryRouteRecord | null;

    if (!route) {
      throw new NotFoundException('Delivery route not found');
    }

    return this.toRouteDetail(route);
  }

  async createRoute(
    dto: CreateDeliveryRouteDto,
    currentUser: Actor,
    idempotencyKey?: string,
  ) {
    if (!['ADMIN', 'SELLER'].includes(currentUser.role)) {
      throw new NotFoundException('Delivery route not found');
    }
    if (currentUser.role === 'SELLER' && !dto.routePlanId) {
      throw new NotFoundException('Delivery route plan not found');
    }

    if (dto.routePlanId) {
      if (!idempotencyKey?.trim())
        throw new BadRequestException(
          'Idempotency-Key is required for optimized route creation',
        );
      return this.createOptimizedRoute(dto, currentUser, idempotencyKey.trim());
    }
    if (!dto.orders?.length) {
      throw new BadRequestException('At least one delivery order is required');
    }

    const route = await this.prisma.$transaction(async (tx) => {
      await this.assertDriver(tx, dto.driverId);
      if (dto.vehicleId) await this.assertActiveVehicle(tx, dto.vehicleId);
      const orders = await this.resolveAssignableSales(tx, dto.orders);

      const routeStockLocationId = dto.routeStockLocationId
        ? await this.resolveProvidedRouteStockLocation(
            tx,
            dto.routeStockLocationId,
          )
        : await this.createRouteStockLocation(tx, dto.name);

      const route = (await tx.deliveryRoute.create({
        data: {
          name: dto.name.trim(),
          driverId: dto.driverId,
          ...(dto.vehicleId ? { vehicleId: dto.vehicleId } : {}),
          scheduledDate: new Date(dto.scheduledDate),
          originLocationId: dto.originLocationId ?? null,
          routeStockLocationId,
          deliveryOrders: {
            create: orders.map((order) => ({
              saleId: order.saleId,
              accountReceivableId: order.accountReceivableId ?? null,
              deliveryAddress: order.deliveryAddress.trim(),
            })),
          },
        },
        include: {
          driver: { select: { id: true, name: true } },
          vehicle: { select: this.routeVehicleSelect() },
          settlement: { select: { id: true } },
          payments: { where: { status: PaymentStatus.APPLIED } },
          deliveryOrders: {
            orderBy: { createdAt: 'asc' },
            include: {
              sale: { select: { id: true, saleNumber: true } },
              accountReceivable: {
                select: { id: true, outstandingAmount: true, version: true },
              },
              evidence: {
                select: {
                  id: true,
                  type: true,
                  value: true,
                  storageKey: true,
                  mimeType: true,
                  sha256: true,
                  sizeBytes: true,
                  capturedAt: true,
                  receivedAt: true,
                  capturedByUserId: true,
                  metadata: true,
                },
              },
            },
          },
        },
      })) as DeliveryRouteRecord;

      await tx.sale.updateMany({
        where: { id: { in: orders.map((order) => order.saleId) } },
        data: { routeId: route.id },
      });

      return route;
    });
    return this.toRouteDetail(route);
  }

  private async createOptimizedRoute(
    dto: CreateDeliveryRouteDto,
    currentUser: Actor,
    idempotencyKey: string,
  ) {
    const payloadHash = this.hashPayload({ ...dto, orders: undefined });
    const route = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.deliveryRoute.findFirst({
        where: { creationIdempotencyKey: idempotencyKey },
        include: this.routeDetailInclude(),
      })) as DeliveryRouteRecord | null;
      if (existing) {
        if (existing.creationPayloadHash !== payloadHash)
          throw new ConflictException(
            'Idempotency-Key was already used with a different payload',
          );
        return existing;
      }

      const plan = await tx.deliveryRoutePlanDraft.findFirst({
        where: { id: dto.routePlanId, createdByUserId: currentUser.id },
      });
      if (!plan) throw new NotFoundException('Delivery route plan not found');
      if (plan.consumedAt || plan.expiresAt <= new Date())
        throw new ConflictException(
          'Delivery route plan is expired or already consumed',
        );
      if (plan.sourceRouteId)
        throw new BadRequestException(
          'A reoptimization plan cannot create a new route',
        );
      if (
        plan.driverId !== dto.driverId ||
        plan.originLocationId !== dto.originLocationId ||
        plan.scheduledDate.toISOString().slice(0, 10) !==
          dto.scheduledDate.slice(0, 10)
      ) {
        throw new ConflictException(
          'Delivery route plan does not match the route context',
        );
      }
      if (!plan.vehicleId) {
        throw new ConflictException(
          'Delivery route plan is missing its required vehicle',
        );
      }
      if (!dto.vehicleId) {
        throw new BadRequestException(
          'vehicleId is required for optimized route creation',
        );
      }
      if (dto.vehicleId !== plan.vehicleId) {
        throw new ConflictException(
          'vehicleId must match the delivery route plan vehicle',
        );
      }
      await this.assertDriver(tx, dto.driverId);
      await this.assertActiveVehicle(tx, plan.vehicleId);
      await this.assertVehicleAvailable(tx, plan.vehicleId);
      const origin = await tx.operationalLocation.findFirst({
        where: {
          id: dto.originLocationId,
          isActive: true,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: { id: true },
      });
      if (!origin)
        throw new ConflictException(
          'Route origin is no longer active or geocoded',
        );
      const stops = plan.orderedStops as unknown as PlannedStop[];
      if (!Array.isArray(stops) || !stops.length)
        throw new ConflictException('Delivery route plan has no stops');
      const resolvedStops = await this.resolveAssignableSales(tx, stops);
      const routeStockLocationId = dto.routeStockLocationId
        ? await this.resolveProvidedRouteStockLocation(
            tx,
            dto.routeStockLocationId,
          )
        : await this.createRouteStockLocation(tx, dto.name);
      const now = new Date();
      const route = (await tx.deliveryRoute.create({
        data: {
          name: dto.name.trim(),
          driverId: dto.driverId,
          vehicleId: plan.vehicleId,
          scheduledDate: new Date(dto.scheduledDate),
          originLocationId: dto.originLocationId,
          routeStockLocationId,
          optimizationStatus: RouteOptimizationStatus.OPTIMIZED,
          geometry: plan.geometry,
          distanceMeters: plan.distanceMeters,
          durationSeconds: plan.durationSeconds,
          optimizedAt: now,
          routingProfile: plan.routingProfile,
          routingDataVersion: plan.routingDataVersion,
          creationIdempotencyKey: idempotencyKey,
          creationPayloadHash: payloadHash,
          deliveryOrders: {
            create: resolvedStops.map((stop) => ({
              saleId: stop.saleId,
              accountReceivableId: stop.accountReceivableId ?? null,
              deliveryAddress: stop.deliveryAddress.trim(),
              latitude: stop.latitude,
              longitude: stop.longitude,
              geocoderOsmType: stop.geocoderOsmType ?? null,
              geocoderOsmId: stop.geocoderOsmId ?? null,
              stopSequence: stop.sequence,
              legDistanceMeters: stop.legDistanceMeters,
              legDurationSeconds: stop.legDurationSeconds,
            })),
          },
        },
        include: this.routeDetailInclude(),
      } as Prisma.DeliveryRouteCreateArgs)) as DeliveryRouteRecord;
      await tx.sale.updateMany({
        where: {
          id: { in: resolvedStops.map((stop) => stop.saleId) },
          routeId: null,
        },
        data: { routeId: route.id },
      });
      const consumed = await tx.deliveryRoutePlanDraft.updateMany({
        where: { id: plan.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now, consumedByRouteId: route.id },
      });
      if (consumed.count !== 1)
        throw new ConflictException(
          'Delivery route plan was consumed concurrently',
        );
      return route;
    });
    return this.toRouteDetail(route);
  }

  async assignOrdersToRoute(
    id: string,
    dto: AssignDeliveryRouteOrdersDto,
    currentUser: Actor,
  ) {
    if (currentUser.role !== 'ADMIN') {
      throw new NotFoundException('Delivery route not found');
    }

    if (dto.routePlanId)
      return this.assignOptimizedPlanToRoute(id, dto.routePlanId, currentUser);
    if (!dto.orders?.length) {
      throw new BadRequestException('At least one delivery order is required');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const route = (await tx.deliveryRoute.findFirst({
        where: this.buildRouteAccessWhere(id, currentUser),
        include: {
          vehicle: { select: this.routeVehicleSelect() },
          settlement: { select: { id: true } },
          deliveryOrders: true,
        },
      })) as DeliveryRouteRecord | null;

      if (!route) {
        throw new NotFoundException('Delivery route not found');
      }
      if (
        route.status === DeliveryRouteStatus.COMPLETED ||
        route.status === DeliveryRouteStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'Cannot assign orders to a completed or cancelled delivery route',
        );
      }
      if (route.settlement?.id) {
        throw new BadRequestException(
          'Cannot assign orders after route settlement has been opened',
        );
      }
      if (route.optimizationStatus === RouteOptimizationStatus.OPTIMIZED) {
        throw new BadRequestException(
          'Optimized routes require a combined reoptimization plan',
        );
      }

      this.assertNoDuplicateRouteSales(route, dto.orders);
      const orders = await this.resolveAssignableSales(
        tx,
        dto.orders,
        route.id,
      );

      const updated = (await tx.deliveryRoute.update({
        where: { id: route.id },
        data: {
          deliveryOrders: {
            create: orders.map((order) => ({
              saleId: order.saleId,
              accountReceivableId: order.accountReceivableId ?? null,
              deliveryAddress: order.deliveryAddress.trim(),
            })),
          },
        },
        include: {
          driver: { select: { id: true, name: true } },
          vehicle: { select: this.routeVehicleSelect() },
          settlement: { select: { id: true } },
          payments: { where: { status: PaymentStatus.APPLIED } },
          deliveryOrders: {
            orderBy: { createdAt: 'asc' },
            include: {
              sale: { select: { id: true, saleNumber: true } },
              accountReceivable: {
                select: { id: true, outstandingAmount: true, version: true },
              },
              evidence: {
                select: {
                  id: true,
                  type: true,
                  value: true,
                  storageKey: true,
                  mimeType: true,
                  sha256: true,
                  sizeBytes: true,
                  capturedAt: true,
                  receivedAt: true,
                  capturedByUserId: true,
                  metadata: true,
                },
              },
            },
          },
        },
      })) as DeliveryRouteRecord;

      await tx.sale.updateMany({
        where: { id: { in: orders.map((order) => order.saleId) } },
        data: { routeId: route.id },
      });

      return updated;
    });
    return this.toRouteDetail(updated);
  }

  private async assignOptimizedPlanToRoute(
    id: string,
    routePlanId: string,
    currentUser: Actor,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const route = (await tx.deliveryRoute.findFirst({
        where: this.buildRouteAccessWhere(id, currentUser),
        include: {
          vehicle: { select: this.routeVehicleSelect() },
          settlement: { select: { id: true } },
          deliveryOrders: true,
        },
      })) as DeliveryRouteRecord | null;
      if (!route) throw new NotFoundException('Delivery route not found');
      if (route.optimizationStatus !== RouteOptimizationStatus.OPTIMIZED)
        throw new BadRequestException(
          'Historical routes must use the legacy orders payload',
        );
      if (route.status !== DeliveryRouteStatus.PENDING || route.settlement?.id)
        throw new ConflictException('The route can no longer be reoptimized');
      const plan = await tx.deliveryRoutePlanDraft.findFirst({
        where: {
          id: routePlanId,
          sourceRouteId: route.id,
          createdByUserId: currentUser.id,
        },
      });
      if (!plan) throw new NotFoundException('Delivery route plan not found');
      const now = new Date();
      if (plan.consumedAt || plan.expiresAt <= now)
        throw new ConflictException(
          'Delivery route plan is expired or already consumed',
        );
      if (
        plan.driverId !== route.driverId ||
        plan.originLocationId !== route.originLocationId ||
        plan.scheduledDate.toISOString().slice(0, 10) !==
          route.scheduledDate.toISOString().slice(0, 10)
      )
        throw new ConflictException(
          'Delivery route plan does not match the route context',
        );
      if (!plan.vehicleId) {
        throw new ConflictException(
          'Delivery route plan is missing its required vehicle',
        );
      }
      if (route.vehicleId && route.vehicleId !== plan.vehicleId) {
        throw new ConflictException(
          'Delivery route plan vehicle does not match the route vehicle',
        );
      }
      await this.assertActiveVehicle(tx, plan.vehicleId);
      await this.assertVehicleAvailable(tx, plan.vehicleId);
      const stops = plan.orderedStops as unknown as PlannedStop[];
      const existingBySale = new Map(
        (route.deliveryOrders ?? []).map((order) => [order.saleId, order]),
      );
      const plannedIds = new Set(stops.map((stop) => stop.saleId));
      const missing = [...existingBySale.keys()].filter(
        (saleId) => !plannedIds.has(saleId),
      );
      if (missing.length)
        throw new ConflictException(
          'The reoptimization plan omits existing route stops',
        );
      const resolvedStops = await this.resolveAssignableSales(
        tx,
        stops,
        route.id,
      );

      await tx.deliveryOrder.updateMany({
        where: { routeId: route.id },
        data: { stopSequence: null },
      });
      for (const stop of resolvedStops.filter((candidate) =>
        existingBySale.has(candidate.saleId),
      )) {
        await tx.deliveryOrder.update({
          where: { saleId: stop.saleId },
          data: {
            accountReceivableId: stop.accountReceivableId ?? null,
            deliveryAddress: stop.deliveryAddress.trim(),
            latitude: stop.latitude,
            longitude: stop.longitude,
            geocoderOsmType: stop.geocoderOsmType ?? null,
            geocoderOsmId: stop.geocoderOsmId ?? null,
            stopSequence: stop.sequence,
            legDistanceMeters: stop.legDistanceMeters,
            legDurationSeconds: stop.legDurationSeconds,
          },
        });
      }
      const newStops = resolvedStops.filter(
        (stop) => !existingBySale.has(stop.saleId),
      );
      const updated = (await tx.deliveryRoute.update({
        where: { id: route.id },
        data: {
          ...(route.vehicleId ? {} : { vehicleId: plan.vehicleId }),
          geometry: plan.geometry,
          distanceMeters: plan.distanceMeters,
          durationSeconds: plan.durationSeconds,
          optimizedAt: now,
          routingProfile: plan.routingProfile,
          routingDataVersion: plan.routingDataVersion,
          deliveryOrders: {
            create: newStops.map((stop) => ({
              saleId: stop.saleId,
              accountReceivableId: stop.accountReceivableId ?? null,
              deliveryAddress: stop.deliveryAddress.trim(),
              latitude: stop.latitude,
              longitude: stop.longitude,
              geocoderOsmType: stop.geocoderOsmType ?? null,
              geocoderOsmId: stop.geocoderOsmId ?? null,
              stopSequence: stop.sequence,
              legDistanceMeters: stop.legDistanceMeters,
              legDurationSeconds: stop.legDurationSeconds,
            })),
          },
        },
        include: this.routeDetailInclude(),
      } as Prisma.DeliveryRouteUpdateArgs)) as DeliveryRouteRecord;
      if (newStops.length)
        await tx.sale.updateMany({
          where: {
            id: { in: newStops.map((stop) => stop.saleId) },
            routeId: null,
          },
          data: { routeId: route.id },
        });
      const consumed = await tx.deliveryRoutePlanDraft.updateMany({
        where: { id: plan.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now, consumedByRouteId: route.id },
      });
      if (consumed.count !== 1)
        throw new ConflictException(
          'Delivery route plan was consumed concurrently',
        );
      return updated;
    });
    return this.toRouteDetail(updated);
  }

  async updateRouteStatus(
    id: string,
    dto: UpdateDeliveryRouteStatusDto,
    currentUser: Actor,
  ) {
    const route = (await this.prisma.deliveryRoute.findFirst({
      where: this.buildRouteAccessWhere(id, currentUser),
      include: { deliveryOrders: true },
    })) as DeliveryRouteRecord | null;

    if (!route) {
      throw new NotFoundException('Delivery route not found');
    }

    this.assertRouteStatusTransition(route, dto.status, currentUser);

    if (dto.status === DeliveryRouteStatus.COMPLETED) {
      const hasOpenOrders = (route.deliveryOrders ?? []).some(
        (order) => !FINAL_ORDER_STATUSES.has(order.status),
      );
      if (hasOpenOrders) {
        throw new BadRequestException(
          'Cannot complete route with pending delivery orders',
        );
      }
    }

    const now = new Date();
    const updateData = {
      status: dto.status,
      ...(dto.status === DeliveryRouteStatus.IN_PROGRESS && !route.startedAt
        ? { startedAt: now }
        : {}),
      ...(dto.status === DeliveryRouteStatus.COMPLETED && !route.completedAt
        ? { completedAt: now }
        : {}),
    };

    let updated: DeliveryRouteRecord;
    if (dto.status === DeliveryRouteStatus.IN_PROGRESS && route.vehicleId) {
      updated = await this.prisma
        .$transaction(async (tx) => {
          await this.assertActiveVehicle(tx, route.vehicleId as string);
          const conflict = await tx.deliveryRoute.findFirst({
            where: {
              vehicleId: route.vehicleId as string,
              status: DeliveryRouteStatus.IN_PROGRESS,
              id: { not: route.id },
            },
            select: { id: true },
          });
          if (conflict) {
            throw new ConflictException(
              'The vehicle already has another in-progress route',
            );
          }
          return tx.deliveryRoute.update({
            where: { id: route.id },
            data: updateData,
            include: this.routeListInclude(),
          });
        })
        .catch((error: unknown) => {
          this.throwVehicleInProgressConflict(error);
          throw error;
        });
    } else {
      updated = await this.prisma.deliveryRoute.update({
        where: { id: route.id },
        data: updateData,
        include: this.routeListInclude(),
      });
    }

    return this.toRouteListItem(updated);
  }

  async updateOrderStatus(
    id: string,
    dto: UpdateDeliveryOrderStatusDto,
    currentUser: Actor,
  ) {
    if (INCIDENT_STATUS_REQUIRING_NOTES.has(dto.status) && !dto.notes?.trim()) {
      throw new BadRequestException(
        'notes is required for delivery incident, return, or rejection statuses',
      );
    }

    const order = (await this.prisma.deliveryOrder.findFirst({
      where: this.buildOrderAccessWhere(id, currentUser),
      include: {
        route: true,
        sale: { select: { id: true, saleNumber: true } },
        accountReceivable: {
          select: { id: true, outstandingAmount: true, version: true },
        },
        evidence: { select: { type: true } },
      },
    })) as DeliveryOrderRecord | null;

    if (!order) {
      throw new NotFoundException('Delivery order not found');
    }

    if (!order.route?.routeStockLocationId) {
      throw new BadRequestException(
        'Route stock location is required to update delivery order status',
      );
    }

    if (dto.status === DeliveryOrderStatus.DELIVERED) {
      const recordedEvidenceTypes = new Set(
        order.evidence?.map((evidence) => evidence.type),
      );
      const missingEvidenceTypes = REQUIRED_DELIVERY_EVIDENCE_TYPES.filter(
        (type) => !recordedEvidenceTypes.has(type),
      );

      if (missingEvidenceTypes.length > 0) {
        throw new BadRequestException(
          `DELIVERED requires ${missingEvidenceTypes.join(' and ')} evidence`,
        );
      }
    }

    const deliveredAt =
      dto.status === DeliveryOrderStatus.DELIVERED
        ? new Date(dto.deliveredAt ?? Date.now())
        : undefined;
    const updated = (await this.prisma.deliveryOrder.update({
      where: { id: order.id },
      data: {
        status: dto.status,
        notes: dto.notes?.trim() ?? order.notes ?? null,
        ...(deliveredAt
          ? { deliveredAt, deliveredByUserId: currentUser.id }
          : {}),
      },
      include: {
        route: true,
        sale: { select: { id: true, saleNumber: true } },
        accountReceivable: {
          select: { id: true, outstandingAmount: true, version: true },
        },
        evidence: { select: { type: true } },
      },
    })) as DeliveryOrderRecord;

    return this.toOrderResponse(updated);
  }

  async captureEvidence(
    id: string,
    dto: CaptureDeliveryEvidenceDto,
    currentUser: Actor,
  ) {
    const order = await this.findAccessibleOrder(id, currentUser);
    const receivedAt = new Date();
    let validatedEvidence: ValidatedDeliveryEvidence;
    try {
      validatedEvidence = validateDeliveryEvidence(dto, receivedAt);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid delivery evidence',
      );
    }

    const storageKey =
      validatedEvidence.content && validatedEvidence.mimeType
        ? buildDeliveryEvidenceStorageKey({
            deliveryOrderId: order.id,
            capturedAt: validatedEvidence.capturedAt,
            mimeType: validatedEvidence.mimeType,
          })
        : null;
    const storage = storageKey ? this.requireObjectStorage() : null;

    if (
      storageKey &&
      storage &&
      validatedEvidence.content &&
      validatedEvidence.sha256
    ) {
      try {
        await storage.putObject({
          key: storageKey,
          body: validatedEvidence.content,
          contentType: validatedEvidence.mimeType ?? 'application/octet-stream',
          checksumSha256: Buffer.from(validatedEvidence.sha256, 'hex').toString(
            'base64',
          ),
        });
      } catch {
        throw new ServiceUnavailableException(
          'Delivery evidence storage is unavailable',
        );
      }
    }

    let evidence: DeliveryEvidenceRecord;
    try {
      evidence = await this.prisma.deliveryEvidence.create({
        data: {
          deliveryOrderId: order.id,
          type: dto.type,
          value: storageKey ? null : validatedEvidence.value,
          storageKey,
          mimeType: validatedEvidence.mimeType,
          sha256: validatedEvidence.sha256,
          sizeBytes: validatedEvidence.sizeBytes,
          capturedAt: validatedEvidence.capturedAt,
          receivedAt,
          capturedByUserId: currentUser.id,
          metadata: validatedEvidence.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (error: unknown) {
      if (storageKey && storage) {
        try {
          await storage.deleteObject(storageKey);
        } catch (cleanupError: unknown) {
          this.logger.error(
            `Failed to clean up delivery evidence object ${storageKey}`,
            cleanupError instanceof Error ? cleanupError.stack : cleanupError,
          );
        }
      }
      throw error;
    }

    return this.toEvidenceResponse(evidence);
  }

  async registerCollection(
    id: string,
    dto: RegisterRouteCollectionDto,
    currentUser: Actor,
    idempotencyKey?: string,
  ) {
    const paymentAmount = Money.from(dto.amount);
    if (!paymentAmount.isPositive()) {
      throw new BadRequestException('amount must be greater than 0');
    }
    this.assertIdempotencyKey(idempotencyKey);
    const normalizedIdempotencyKey = idempotencyKey.trim();

    const order = await this.findAccessibleOrder(id, currentUser);
    if (
      !order.accountReceivableId ||
      order.accountReceivableId !== dto.accountReceivableId
    ) {
      throw new BadRequestException(
        'Route collection must apply to the delivery order account receivable',
      );
    }

    const routeSettlementId = order.route?.settlement?.id ?? null;
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const payloadHash = this.hashPayload({
      operation: 'REGISTER_ROUTE_COLLECTION',
      deliveryOrderId: id,
      accountReceivableId: dto.accountReceivableId,
      amount: paymentAmount.toString(),
      paymentMethod: dto.paymentMethod,
      reference: dto.reference?.trim() || null,
      paidAt: dto.paidAt ?? null,
      collectionPass: dto.collectionPass ?? null,
      expectedVersion: dto.expectedVersion,
      routeId: order.routeId,
      routeSettlementId,
      userId: currentUser.id,
    });

    try {
      return await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const transactionOrder = await this.findAccessibleOrder(
              id,
              currentUser,
              tx,
            );
            if (
              !transactionOrder.accountReceivableId ||
              transactionOrder.accountReceivableId !==
                dto.accountReceivableId ||
              transactionOrder.routeId !== order.routeId ||
              (transactionOrder.route?.settlement?.id ?? null) !==
                routeSettlementId
            ) {
              throw new ConflictException(
                'Route collection context changed; refresh and retry',
              );
            }

            const existingPayment = (await tx.payment.findFirst({
              where: { idempotencyKey: normalizedIdempotencyKey },
            })) as RoutePaymentRecord | null;
            if (existingPayment) {
              this.assertSameIdempotencyPayload(
                existingPayment.idempotencyPayloadHash,
                payloadHash,
                'Idempotency-Key was already used for a different route collection payload',
              );
              return this.buildRouteCollectionResponse(
                tx,
                id,
                currentUser,
                existingPayment,
              );
            }

            const receivable = (await tx.accountReceivable.findUnique({
              where: { id: dto.accountReceivableId },
            })) as RouteCollectionReceivable | null;

            if (!receivable) {
              throw new NotFoundException('Account receivable not found');
            }

            this.assertReceivableCanReceiveRoutePayment(receivable);
            if (receivable.version !== dto.expectedVersion) {
              throw new ConflictException(
                'Account receivable version does not match expectedVersion',
              );
            }

            const outstandingAmount = Money.from(receivable.outstandingAmount);
            if (paymentAmount.compare(outstandingAmount) > 0) {
              throw new BadRequestException(
                'Payment amount cannot exceed outstanding balance',
              );
            }

            const newOutstandingAmount =
              outstandingAmount.subtract(paymentAmount);
            const nextStatus = newOutstandingAmount.isZero()
              ? CollectionStatus.PAID
              : CollectionStatus.PARTIALLY_PAID;
            const aging = calculateReceivableAging(
              receivable.dueDate,
              newOutstandingAmount,
              paidAt,
            );

            const payment = (await tx.payment.create({
              data: {
                accountReceivableId: receivable.id,
                customerId: receivable.customerId,
                saleId: receivable.saleId,
                userId: currentUser.id,
                collectedByUserId: currentUser.id,
                collectionPass: dto.collectionPass ?? null,
                amount: paymentAmount.toString(),
                paymentMethod: dto.paymentMethod,
                referenceNumber: dto.reference?.trim() || null,
                routeId: order.routeId,
                routeSettlementId,
                status: PaymentStatus.APPLIED,
                paidAt,
                idempotencyKey: normalizedIdempotencyKey,
                idempotencyPayloadHash: payloadHash,
              },
            })) as RoutePaymentRecord;

            try {
              await tx.accountReceivable.update({
                where: { id: receivable.id, version: receivable.version },
                data: {
                  outstandingAmount: newOutstandingAmount.toString(),
                  status: nextStatus,
                  lastPaymentDate: paidAt,
                  paidAt: nextStatus === CollectionStatus.PAID ? paidAt : null,
                  ...aging,
                  version: { increment: 1 },
                },
              });
            } catch (error) {
              if (this.isStaleVersionError(error)) {
                throw new ConflictException(
                  'Account receivable version does not match expectedVersion',
                );
              }
              throw error;
            }

            await tx.sale.update({
              where: { id: receivable.saleId },
              data: { collectionStatus: nextStatus },
            });

            const updatedOrder = (await tx.deliveryOrder.update({
              where: { id: transactionOrder.id },
              data: {
                collectedByUserId: currentUser.id,
                collectionPass:
                  dto.collectionPass ?? transactionOrder.collectionPass ?? null,
              },
              include: {
                route: true,
                sale: {
                  select: {
                    id: true,
                    saleNumber: true,
                    customer: { select: { name: true } },
                  },
                },
                accountReceivable: {
                  select: { id: true, outstandingAmount: true, version: true },
                },
                evidence: { select: { type: true } },
              },
            })) as DeliveryOrderRecord;

            return {
              payment: this.toPaymentResponse(payment),
              deliveryOrder: {
                ...this.toOrderResponse(updatedOrder),
                derivedCollectedAmount: this.toNumber(payment.amount),
              },
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      if (this.isIdempotencyUniqueConflict(error)) {
        return this.resolveExistingRouteCollectionByKey(
          id,
          currentUser,
          normalizedIdempotencyKey,
          payloadHash,
        );
      }
      throw error;
    }
  }

  async registerIncident(
    id: string,
    dto: RegisterDeliveryIncidentDto,
    currentUser: Actor,
  ) {
    if (!INCIDENT_STATUS_REQUIRING_NOTES.has(dto.status)) {
      throw new BadRequestException(
        'Incident endpoint only accepts non-delivery, return, or partial rejection statuses',
      );
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const order = await this.findAccessibleOrder(id, currentUser, tx);
      if (!order.route?.routeStockLocationId) {
        throw new BadRequestException(
          'Route stock location is required to register delivery incidents',
        );
      }

      const updatedOrder = (await tx.deliveryOrder.update({
        where: { id: order.id },
        data: {
          status: dto.status,
          notes: dto.reason.trim(),
        },
        include: {
          route: true,
          sale: {
            select: {
              id: true,
              saleNumber: true,
              customer: { select: { name: true } },
            },
          },
          accountReceivable: {
            select: { id: true, outstandingAmount: true, version: true },
          },
          evidence: { select: { type: true } },
        },
      })) as DeliveryOrderRecord;

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

      const occurredAt = new Date();
      const position = await this.findRecentIncidentPosition(
        tx,
        order,
        occurredAt,
      );
      const incident = (await tx.deliveryIncident.create({
        data: {
          type: this.incidentTypeForStatus(dto.status),
          status: DeliveryIncidentStatus.OPEN,
          reason: dto.reason.trim(),
          routeId: order.routeId,
          deliveryOrderId: order.id,
          vehicleId: order.route.vehicleId ?? null,
          driverId: order.route.driverId ?? null,
          positionId: position?.id ?? null,
          statusSnapshot: updatedOrder.status,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          returnedItems: (dto.returnedItems ??
            []) as unknown as Prisma.InputJsonValue,
          evidence: [],
          occurredAt,
          reportedByUserId: currentUser.id,
        },
      })) as DeliveryIncidentRecord;

      const incidentResponse = this.toIncidentResponse(incident, order);

      return {
        deliveryOrder: this.toOrderResponse(updatedOrder),
        inventoryMovements: inventoryMovements.map((movement) =>
          this.toInventoryMovementResponse(movement),
        ),
        incident: incidentResponse,
        event: this.toIncidentEventPayload(incident, order),
        originLocationId: order.route.originLocationId ?? null,
      };
    });

    this.publishIncidentCreated(
      transactionResult.event,
      transactionResult.originLocationId,
    );

    return {
      deliveryOrder: transactionResult.deliveryOrder,
      inventoryMovements: transactionResult.inventoryMovements,
      incident: transactionResult.incident,
    };
  }

  private async findRecentIncidentPosition(
    tx: Prisma.TransactionClient,
    order: DeliveryOrderRecord,
    occurredAt: Date,
  ): Promise<IncidentPositionRecord | null> {
    const vehicleId = order.route?.vehicleId;
    if (!vehicleId) return null;

    return await tx.vehiclePosition.findFirst({
      where: {
        routeId: order.routeId,
        vehicleId,
        driverId: order.route?.driverId,
        recordedAt: {
          gte: new Date(occurredAt.getTime() - INCIDENT_POSITION_MAX_AGE_MS),
          lte: occurredAt,
        },
      },
      orderBy: [{ recordedAt: 'desc' }, { receivedAt: 'desc' }],
      select: { id: true, latitude: true, longitude: true, recordedAt: true },
    });
  }

  private incidentTypeForStatus(
    status: DeliveryOrderStatus,
  ): DeliveryIncidentType {
    switch (status) {
      case DeliveryOrderStatus.NOT_DELIVERED:
      case DeliveryOrderStatus.PARTIALLY_REJECTED:
      case DeliveryOrderStatus.RETURNED:
        return DeliveryIncidentType.DELIVERY_FAILURE;
      default:
        return DeliveryIncidentType.OTHER;
    }
  }

  private toIncidentResponse(
    incident: DeliveryIncidentRecord,
    order: DeliveryOrderRecord,
  ) {
    return {
      id: incident.id,
      type: incident.type,
      status: incident.status,
      reason: incident.reason,
      details: incident.details ?? null,
      routeId: incident.routeId ?? order.routeId,
      deliveryOrderId: incident.deliveryOrderId ?? order.id,
      vehicleId: incident.vehicleId ?? order.route?.vehicleId ?? null,
      driverId: incident.driverId ?? order.route?.driverId ?? null,
      positionId: incident.positionId ?? null,
      statusSnapshot: incident.statusSnapshot,
      latitude: this.toNumberOrNull(incident.latitude),
      longitude: this.toNumberOrNull(incident.longitude),
      zoneId: incident.zoneId ?? null,
      returnedItems: incident.returnedItems ?? [],
      evidence: incident.evidence ?? [],
      resolution: incident.resolution ?? null,
      occurredAt: incident.occurredAt.toISOString(),
      reportedAt: incident.reportedAt.toISOString(),
      reportedByUserId: incident.reportedByUserId,
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      resolvedByUserId: incident.resolvedByUserId ?? null,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
      position: this.coordinatePair(incident.latitude, incident.longitude),
      stop: this.coordinatePair(order.latitude, order.longitude),
    };
  }

  private toIncidentEventPayload(
    incident: DeliveryIncidentRecord,
    order: DeliveryOrderRecord,
  ): FleetIncidentCreatedPayload {
    return {
      incidentId: incident.id,
      deliveryOrderId: order.id,
      routeId: order.routeId,
      vehicleId: order.route?.vehicleId ?? null,
      driverId: order.route?.driverId ?? '',
      status: incident.status,
      reason: incident.reason,
      occurredAt: incident.occurredAt.toISOString(),
      position: this.coordinatePair(incident.latitude, incident.longitude),
      stop: this.coordinatePair(order.latitude, order.longitude),
    };
  }

  private publishIncidentCreated(
    payload: FleetIncidentCreatedPayload,
    originLocationId: string | null,
  ): void {
    if (!this.fleetGateway) return;
    try {
      this.fleetGateway.emitIncidentCreated(payload, originLocationId);
    } catch {
      // The committed incident remains authoritative when realtime delivery is unavailable.
    }
  }

  async openSettlement(routeId: string, currentUser: Actor) {
    const route = (await this.prisma.deliveryRoute.findFirst({
      where: this.buildRouteAccessWhere(routeId, currentUser),
      include: {
        settlement: { select: { id: true } },
        payments: { where: { status: PaymentStatus.APPLIED } },
        deliveryOrders: {
          include: {
            accountReceivable: {
              select: { id: true, outstandingAmount: true, version: true },
            },
          },
        },
      },
    })) as DeliveryRouteRecord | null;

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
    const settlementStatus =
      summary.differenceAmount !== 0 ||
      (inventoryMovements as unknown[]).length > 0
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
        overdueAmount:
          summary.differenceAmount > 0 ? summary.differenceAmount : 0,
        secondPassCollectionsAmount: summary.secondPassCollectedAmount,
        routeCollectionsSummary: summary,
      },
    })) as RouteSettlementRecord;

    return this.toSettlementResponse(settlement, summary);
  }

  async closeSettlement(
    id: string,
    dto: CloseRouteSettlementDto,
    currentUser: Actor,
    idempotencyKey?: string,
  ) {
    this.assertSettlementPermissions(currentUser);
    this.assertIdempotencyKey(idempotencyKey);
    const payloadHash = this.hashPayload(
      this.buildSettlementActionPayload('close', id, currentUser.id, dto),
    );

    const settlement = (await this.prisma.routeSettlement.findUnique({
      where: { id },
      include: { route: { include: { deliveryOrders: true } } },
    })) as RouteSettlementRecord | null;

    if (!settlement) {
      throw new NotFoundException('Route settlement not found');
    }
    if (
      settlement.status === RouteSettlementStatus.CLOSED &&
      this.hasMatchingSettlementIdempotency(
        settlement,
        'close',
        idempotencyKey,
        payloadHash,
      )
    ) {
      return this.toSettlementResponse(settlement);
    }
    if (settlement.status === RouteSettlementStatus.CLOSED) {
      throw new BadRequestException('Route settlement is already closed');
    }
    if (settlement.version !== dto.expectedVersion) {
      throw new ConflictException(
        'Route settlement version does not match expectedVersion',
      );
    }

    this.assertRouteOrdersFinal({
      deliveryOrders: settlement.route?.deliveryOrders ?? [],
    } as DeliveryRouteRecord);

    const closed = await this.updateSettlementVersioned({
      where: { id, version: dto.expectedVersion },
      data: {
        status: RouteSettlementStatus.CLOSED,
        closedAt: new Date(),
        notes: dto.notes?.trim() || null,
        routeCollectionsSummary: this.withSettlementIdempotency(
          settlement.routeCollectionsSummary,
          'close',
          idempotencyKey,
          payloadHash,
        ),
        version: { increment: 1 },
      },
    });

    return this.toSettlementResponse(closed);
  }

  async reopenSettlement(
    id: string,
    dto: ReopenRouteSettlementDto,
    currentUser: Actor,
    idempotencyKey?: string,
  ) {
    this.assertSettlementPermissions(currentUser);
    this.assertIdempotencyKey(idempotencyKey);
    const payloadHash = this.hashPayload(
      this.buildSettlementActionPayload('reopen', id, currentUser.id, dto),
    );

    const settlement = (await this.prisma.routeSettlement.findUnique({
      where: { id },
    })) as RouteSettlementRecord | null;

    if (!settlement) {
      throw new NotFoundException('Route settlement not found');
    }
    if (
      settlement.status === RouteSettlementStatus.OPEN &&
      this.hasMatchingSettlementIdempotency(
        settlement,
        'reopen',
        idempotencyKey,
        payloadHash,
      )
    ) {
      return this.toSettlementResponse(settlement);
    }
    if (settlement.status !== RouteSettlementStatus.CLOSED) {
      throw new BadRequestException(
        'Only closed route settlements can be reopened',
      );
    }
    if (settlement.version !== dto.expectedVersion) {
      throw new ConflictException(
        'Route settlement version does not match expectedVersion',
      );
    }

    const reopened = await this.updateSettlementVersioned({
      where: { id, version: dto.expectedVersion },
      data: {
        status: RouteSettlementStatus.OPEN,
        reopenedAt: new Date(),
        reopenedByUserId: currentUser.id,
        reopenedReason: dto.reason.trim(),
        closedAt: null,
        routeCollectionsSummary: this.withSettlementIdempotency(
          settlement.routeCollectionsSummary,
          'reopen',
          idempotencyKey,
          payloadHash,
        ),
        version: { increment: 1 },
      },
    });

    return this.toSettlementResponse(reopened);
  }

  private buildRouteWhere(
    query: ListDeliveryRoutesQueryDto,
    currentUser: Actor,
  ): Prisma.DeliveryRouteWhereInput {
    return {
      ...(currentUser.role === 'DRIVER'
        ? { driverId: currentUser.id }
        : query.driverId
          ? { driverId: query.driverId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.originLocationId
        ? { originLocationId: query.originLocationId }
        : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.scheduledDate
        ? { scheduledDate: this.buildDateFilter(query.scheduledDate) }
        : {}),
    };
  }

  private buildRouteAccessWhere(
    id: string,
    currentUser: Actor,
  ): Prisma.DeliveryRouteWhereInput {
    return {
      id,
      ...(currentUser.role === 'DRIVER' ? { driverId: currentUser.id } : {}),
    };
  }

  private buildOrderAccessWhere(
    id: string,
    currentUser: Actor,
  ): Prisma.DeliveryOrderWhereInput {
    return {
      id,
      ...(currentUser.role === 'DRIVER'
        ? { route: { driverId: currentUser.id } }
        : {}),
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
        accountReceivable: {
          select: { id: true, outstandingAmount: true, version: true },
        },
        evidence: { select: { type: true } },
      },
    })) as DeliveryOrderRecord | null;

    if (!order) {
      throw new NotFoundException('Delivery order not found');
    }
    return order;
  }

  private buildPagination(query: ListDeliveryRoutesQueryDto): {
    skip?: number;
    take?: number;
  } {
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
      vehicle: { select: this.routeVehicleSelect() },
      settlement: { select: { id: true } },
      deliveryOrders: true,
    };
  }

  private routeDetailInclude() {
    return {
      driver: { select: { id: true, name: true } },
      vehicle: { select: this.routeVehicleSelect() },
      settlement: { select: { id: true } },
      payments: { where: { status: PaymentStatus.APPLIED } },
      deliveryOrders: {
        orderBy: [
          { stopSequence: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
        include: {
          sale: {
            select: {
              id: true,
              saleNumber: true,
              customer: { select: { name: true } },
            },
          },
          accountReceivable: {
            select: { id: true, outstandingAmount: true, version: true },
          },
          evidence: {
            select: {
              id: true,
              type: true,
              value: true,
              storageKey: true,
              mimeType: true,
              sha256: true,
              sizeBytes: true,
              capturedAt: true,
              receivedAt: true,
              capturedByUserId: true,
              metadata: true,
            },
          },
        },
      },
    };
  }

  private routeVehicleSelect() {
    return {
      id: true,
      code: true,
      displayName: true,
      plateNumber: true,
    };
  }

  private async resolveProvidedRouteStockLocation(
    tx: Prisma.TransactionClient,
    routeStockLocationId: string,
  ) {
    const location = await tx.operationalLocation.findFirst({
      where: {
        id: routeStockLocationId,
        type: OperationalLocationType.ROUTE_STOCK,
        isActive: true,
      },
    });
    if (!location) {
      throw new NotFoundException('Route stock location not found');
    }
    const existingRoute = await tx.deliveryRoute.findFirst({
      where: { routeStockLocationId },
      select: { id: true },
    });
    if (existingRoute) {
      throw new BadRequestException(
        'Route stock location is already assigned to another delivery route',
      );
    }
    return routeStockLocationId;
  }

  private async createRouteStockLocation(
    tx: Prisma.TransactionClient,
    routeName: string,
  ) {
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
      throw new BadRequestException(
        'Assigned driver must be an active DRIVER user',
      );
    }
  }

  private async assertActiveVehicle(
    tx: Prisma.TransactionClient,
    vehicleId: string,
  ) {
    const vehicle = await tx.vehicle.findFirst({
      where: { id: vehicleId, isActive: true },
      select: { id: true },
    });
    if (!vehicle) {
      throw new BadRequestException(
        'Assigned vehicle must be an active fleet vehicle',
      );
    }
  }

  private async assertVehicleAvailable(
    tx: Prisma.TransactionClient,
    vehicleId: string,
  ) {
    const activeRoute = await tx.deliveryRoute.findFirst({
      where: {
        vehicleId,
        status: DeliveryRouteStatus.IN_PROGRESS,
      },
      select: { id: true },
    });
    if (activeRoute) {
      throw new ConflictException(
        'The selected vehicle already has an in-progress route',
      );
    }
  }

  private throwVehicleInProgressConflict(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'The vehicle already has another in-progress route',
      );
    }
  }

  private async resolveAssignableSales<
    T extends { saleId: string; accountReceivableId?: string | null },
  >(tx: Prisma.TransactionClient, orders: T[], routeId?: string): Promise<T[]> {
    const saleIds = orders.map((order) => order.saleId);
    const uniqueSaleIds = [...new Set(saleIds)];
    if (uniqueSaleIds.length !== saleIds.length) {
      throw new BadRequestException(
        'Duplicate sales cannot be assigned to the same route',
      );
    }

    const sales = (await tx.sale.findMany({
      where: { id: { in: uniqueSaleIds } },
      select: {
        id: true,
        status: true,
        routeId: true,
        accountReceivable: { select: { id: true } },
      },
    })) as AssignableSaleRecord[];
    const salesById = new Map(sales.map((sale) => [sale.id, sale]));

    for (const order of orders) {
      const sale = salesById.get(order.saleId);
      if (!sale) {
        throw new NotFoundException(`Sale ${order.saleId} not found`);
      }
      if (sale.status !== SaleStatus.CONFIRMED) {
        throw new BadRequestException(
          'Only confirmed non-cancelled sales can be assigned to delivery routes',
        );
      }
      if (sale.routeId && sale.routeId !== routeId) {
        throw new BadRequestException(
          'Sale is already assigned to another delivery route',
        );
      }
      if (
        order.accountReceivableId &&
        sale.accountReceivable?.id !== order.accountReceivableId
      ) {
        throw new BadRequestException(
          'Account receivable must belong to the assigned sale',
        );
      }
    }

    return orders.map((order) => {
      const sale = salesById.get(order.saleId)!;
      return {
        ...order,
        accountReceivableId:
          order.accountReceivableId ?? sale.accountReceivable?.id ?? undefined,
      };
    });
  }

  private assertNoDuplicateRouteSales(
    route: DeliveryRouteRecord,
    orders: CreateDeliveryRouteDto['orders'],
  ) {
    const existingSaleIds = new Set(
      (route.deliveryOrders ?? []).map((order) => order.saleId),
    );
    const duplicateSale = orders.find((order) =>
      existingSaleIds.has(order.saleId),
    );
    if (duplicateSale) {
      throw new BadRequestException(
        'Sale is already assigned to this delivery route',
      );
    }
  }

  private assertRouteStatusTransition(
    route: DeliveryRouteRecord,
    targetStatus: DeliveryRouteStatus,
    currentUser: Actor,
  ) {
    if (currentUser.role === 'DRIVER') {
      const allowedDriverStatuses = new Set<DeliveryRouteStatus>([
        DeliveryRouteStatus.IN_PROGRESS,
        DeliveryRouteStatus.COMPLETED,
      ]);
      if (!allowedDriverStatuses.has(targetStatus)) {
        throw new ForbiddenException(
          'Drivers can only start or complete their own delivery routes',
        );
      }
    }

    if (
      route.status === DeliveryRouteStatus.COMPLETED &&
      targetStatus !== DeliveryRouteStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Completed delivery routes cannot be reopened',
      );
    }
  }

  private toRouteListItem(route: DeliveryRouteRecord) {
    const orders = route.deliveryOrders ?? [];
    return {
      id: route.id,
      name: route.name,
      driverId: route.driverId,
      driverName: route.driver?.name ?? null,
      vehicleId: route.vehicle?.id ?? route.vehicleId ?? null,
      vehicleCode: route.vehicle?.code ?? null,
      vehicle: route.vehicle
        ? {
            id: route.vehicle.id,
            code: route.vehicle.code,
            displayName: route.vehicle.displayName,
            plateNumber: route.vehicle.plateNumber,
          }
        : null,
      status: route.status,
      scheduledDate: route.scheduledDate.toISOString(),
      originLocationId: route.originLocationId ?? null,
      routeStockLocationId: route.routeStockLocationId,
      startedAt: route.startedAt?.toISOString() ?? null,
      completedAt: route.completedAt?.toISOString() ?? null,
      ordersCount: orders.length,
      pendingOrdersCount: orders.filter(
        (order) => !FINAL_ORDER_STATUSES.has(order.status),
      ).length,
      routeSettlementId: route.settlement?.id ?? null,
      optimizationStatus:
        route.optimizationStatus ?? RouteOptimizationStatus.NOT_OPTIMIZED,
      mapAvailable:
        route.optimizationStatus === RouteOptimizationStatus.OPTIMIZED &&
        Boolean(route.geometry),
      distanceMeters: route.distanceMeters ?? null,
      durationSeconds: route.durationSeconds ?? null,
      optimizedAt: route.optimizedAt?.toISOString() ?? null,
      routingProfile: route.routingProfile ?? null,
      routingDataVersion: route.routingDataVersion ?? null,
      createdAt: route.createdAt.toISOString(),
    };
  }

  private async toRouteDetail(route: DeliveryRouteRecord) {
    const payments = route.payments ?? [];
    const evidenceSummary = (
      await Promise.all(
        (route.deliveryOrders ?? []).map(async (order) =>
          Promise.all(
            (order.evidence ?? []).map(async (evidence) => ({
              id: evidence.id ?? null,
              deliveryOrderId: order.id,
              saleNumber: order.sale?.saleNumber ?? null,
              type: evidence.type,
              value: evidence.value ?? null,
              storageKey: evidence.storageKey ?? null,
              contentUrl: await this.resolveEvidenceContentUrl(
                evidence.storageKey,
              ),
              mimeType: evidence.mimeType ?? null,
              sha256: evidence.sha256 ?? null,
              sizeBytes: evidence.sizeBytes ?? null,
              capturedAt: evidence.capturedAt?.toISOString() ?? null,
              receivedAt: evidence.receivedAt?.toISOString() ?? null,
              capturedByUserId: evidence.capturedByUserId ?? null,
              metadata: evidence.metadata ?? null,
            })),
          ),
        ),
      )
    ).flat();

    return {
      ...this.toRouteListItem(route),
      geometry: route.geometry ?? null,
      orders: (route.deliveryOrders ?? []).map((order) =>
        this.toOrderResponse(order, payments),
      ),
      evidenceSummary,
      collectionsSummary: this.buildCollectionsSummary(
        route.payments ?? [],
        route.deliveryOrders ?? [],
      ),
    };
  }

  private toOrderResponse(
    order: DeliveryOrderRecord,
    payments: PaymentSummaryRecord[] = [],
  ) {
    const accountReceivableId =
      order.accountReceivableId ?? order.accountReceivable?.id ?? null;

    return {
      id: order.id,
      saleId: order.saleId,
      saleNumber: order.sale?.saleNumber ?? null,
      customerName: order.sale?.customer?.name ?? null,
      accountReceivableId,
      accountReceivableVersion: accountReceivableId
        ? (order.accountReceivable?.version ?? null)
        : null,
      outstandingAmount: accountReceivableId
        ? this.toNumber(order.accountReceivable?.outstandingAmount)
        : null,
      derivedCollectedAmount: this.deriveOrderCollectedAmount(order, payments),
      status: order.status,
      deliveryAddress: order.deliveryAddress,
      latitude: order.latitude == null ? null : this.toNumber(order.latitude),
      longitude:
        order.longitude == null ? null : this.toNumber(order.longitude),
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

  private deriveOrderCollectedAmount(
    order: DeliveryOrderRecord,
    payments: PaymentSummaryRecord[],
  ) {
    const accountReceivableId =
      order.accountReceivableId ?? order.accountReceivable?.id;
    if (!accountReceivableId) return 0;

    return this.roundMoney(
      payments
        .filter(
          (payment) =>
            payment.accountReceivableId === accountReceivableId &&
            (payment.status === undefined ||
              payment.status === PaymentStatus.APPLIED),
        )
        .reduce((total, payment) => total + this.toNumber(payment.amount), 0),
    );
  }

  private async buildRouteCollectionResponse(
    client: Prisma.TransactionClient | PrismaService,
    orderId: string,
    currentUser: Actor,
    payment: RoutePaymentRecord,
  ) {
    const order = await this.findAccessibleOrder(orderId, currentUser, client);
    return {
      payment: this.toPaymentResponse(payment),
      deliveryOrder: {
        ...this.toOrderResponse(order),
        derivedCollectedAmount: this.toNumber(payment.amount),
      },
    };
  }

  private async resolveEvidenceContentUrl(storageKey?: string | null) {
    if (!storageKey) return null;
    const storage = this.requireObjectStorage();

    try {
      return await storage.getDownloadUrl(storageKey);
    } catch {
      throw new ServiceUnavailableException(
        'Delivery evidence storage is unavailable',
      );
    }
  }

  private async resolveExistingRouteCollectionByKey(
    orderId: string,
    currentUser: Actor,
    idempotencyKey: string,
    payloadHash: string,
  ) {
    const existingPayment = (await this.prisma.payment.findFirst({
      where: { idempotencyKey },
    })) as RoutePaymentRecord | null;

    if (!existingPayment) {
      throw new ConflictException(
        'Concurrent route collection is still in progress; retry with the same Idempotency-Key',
      );
    }

    this.assertSameIdempotencyPayload(
      existingPayment.idempotencyPayloadHash,
      payloadHash,
      'Idempotency-Key was already used for a different route collection payload',
    );

    return this.buildRouteCollectionResponse(
      this.prisma,
      orderId,
      currentUser,
      existingPayment,
    );
  }

  private async toEvidenceResponse(evidence: DeliveryEvidenceRecord) {
    return {
      id: evidence.id,
      deliveryOrderId: evidence.deliveryOrderId,
      type: evidence.type,
      value: evidence.value,
      storageKey: evidence.storageKey ?? null,
      contentUrl: await this.resolveEvidenceContentUrl(evidence.storageKey),
      mimeType: evidence.mimeType ?? null,
      sha256: evidence.sha256 ?? null,
      sizeBytes: evidence.sizeBytes ?? null,
      capturedAt: evidence.capturedAt.toISOString(),
      receivedAt: evidence.receivedAt?.toISOString() ?? null,
      capturedByUserId: evidence.capturedByUserId ?? null,
      metadata: evidence.metadata ?? null,
    };
  }

  private requireObjectStorage() {
    if (!this.objectStorage?.isConfigured()) {
      throw new ServiceUnavailableException(
        'Delivery evidence storage is not configured',
      );
    }
    return this.objectStorage;
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
      paidAt:
        payment.paidAt instanceof Date
          ? payment.paidAt.toISOString()
          : payment.paidAt,
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

  private buildCollectionsSummary(
    payments: PaymentSummaryRecord[],
    orders: DeliveryOrderRecord[] = [],
  ) {
    const expectedAmount = orders.reduce((total, order) => {
      return (
        total +
        Number(order.accountReceivable?.outstandingAmount?.toString() ?? 0)
      );
    }, 0);

    const summary = payments.reduce<{
      expectedAmount: number;
      totalCollectedAmount: number;
      firstPassCollectedAmount: number;
      secondPassCollectedAmount: number;
      collectedByMethod: Record<string, number>;
    }>(
      (summary, payment) => {
        const amount = Number(payment.amount?.toString() ?? 0);
        const method = payment.paymentMethod;
        summary.collectedByMethod[method] =
          (summary.collectedByMethod[method] ?? 0) + amount;
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
        collectedByMethod: {},
      },
    );

    return {
      ...summary,
      derivedCollectedAmount: summary.totalCollectedAmount,
      firstPassAmount: summary.firstPassCollectedAmount,
      secondPassAmount: summary.secondPassCollectedAmount,
      derivedCollectedCashAmount:
        summary.collectedByMethod[PaymentMethod.CASH] ?? 0,
      derivedCollectedTransferAmount:
        (summary.collectedByMethod[PaymentMethod.TRANSFER] ?? 0) +
        (summary.collectedByMethod[PaymentMethod.DEPOSIT] ?? 0),
    };
  }

  private assertReceivableCanReceiveRoutePayment(
    receivable: RouteCollectionReceivable,
  ) {
    if (
      receivable.status === CollectionStatus.CANCELLED ||
      receivable.status === CollectionStatus.PAID
    ) {
      throw new BadRequestException(
        'Account receivable cannot receive route collections',
      );
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
      throw new BadRequestException(
        'Returned item quantity must be greater than 0',
      );
    }

    const {
      previousQuantityKg,
      previousQuantityPieces,
      newQuantityKg,
      newQuantityPieces,
    } = await this.balanceService.increase(
      tx,
      params.item.productId,
      params.routeStockLocationId,
      { quantityKg, quantityPieces },
    );

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
      throw new ForbiddenException(
        'Only ADMIN or COLLECTIONS can manage route settlements',
      );
    }
  }

  private assertRouteOrdersFinal(route: DeliveryRouteRecord) {
    const hasOpenOrders = (route.deliveryOrders ?? []).some(
      (order) => !FINAL_ORDER_STATUSES.has(order.status),
    );
    if (hasOpenOrders) {
      throw new BadRequestException(
        'Cannot settle route with pending delivery orders',
      );
    }
  }

  private buildSettlementSummary(route: DeliveryRouteRecord) {
    const expectedAmount = this.roundMoney(
      (route.deliveryOrders ?? []).reduce(
        (total, order) =>
          total + this.toNumber(order.accountReceivable?.outstandingAmount),
        0,
      ),
    );
    const appliedPayments = (route.payments ?? []).filter(
      (payment) => payment.status === PaymentStatus.APPLIED,
    );
    const collectedCashAmount = this.roundMoney(
      appliedPayments
        .filter((payment) => payment.paymentMethod === PaymentMethod.CASH)
        .reduce((total, payment) => total + this.toNumber(payment.amount), 0),
    );
    const collectedTransferAmount = this.roundMoney(
      appliedPayments
        .filter(
          (payment) =>
            payment.paymentMethod === PaymentMethod.TRANSFER ||
            payment.paymentMethod === PaymentMethod.DEPOSIT,
        )
        .reduce((total, payment) => total + this.toNumber(payment.amount), 0),
    );
    const totalCollectedAmount = this.roundMoney(
      appliedPayments.reduce(
        (total, payment) => total + this.toNumber(payment.amount),
        0,
      ),
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
      deliveredOrdersCount: (route.deliveryOrders ?? []).filter(
        (order) => order.status === DeliveryOrderStatus.DELIVERED,
      ).length,
      incidentOrdersCount: (route.deliveryOrders ?? []).filter(
        (order) => order.status !== DeliveryOrderStatus.DELIVERED,
      ).length,
      differenceAmount: this.roundMoney(expectedAmount - totalCollectedAmount),
    };
  }

  private toSettlementResponse(
    settlement: RouteSettlementRecord,
    summary?: ReturnType<DeliveryService['buildSettlementSummary']>,
  ) {
    return {
      id: settlement.id,
      routeId: settlement.routeId,
      driverId: settlement.driverId,
      status: settlement.status,
      version: settlement.version,
      expectedCashAmount: this.toNumber(settlement.expectedCashAmount),
      derivedCollectedCashAmount:
        summary?.collectedCashAmount ??
        this.toNumber(settlement.paidAtDeliveryAmount),
      expectedTransferAmount: this.toNumber(settlement.expectedTransferAmount),
      derivedCollectedTransferAmount: summary?.collectedTransferAmount ?? 0,
      differenceAmount: this.toNumber(settlement.differenceAmount),
      paidAtDeliveryAmount: this.toNumber(settlement.paidAtDeliveryAmount),
      overdueAmount: this.toNumber(settlement.overdueAmount),
      secondPassCollectionsAmount: this.toNumber(
        settlement.secondPassCollectionsAmount,
      ),
      closedAt: settlement.closedAt?.toISOString() ?? null,
    };
  }

  private async updateSettlementVersioned(
    args: Prisma.RouteSettlementUpdateArgs,
  ) {
    try {
      return (await this.prisma.routeSettlement.update(
        args,
      )) as RouteSettlementRecord;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2025'
      ) {
        throw new ConflictException(
          'Route settlement version does not match expectedVersion',
        );
      }
      throw error;
    }
  }

  private assertIdempotencyKey(
    idempotencyKey?: string,
  ): asserts idempotencyKey is string {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSerializableConflict(error)) throw error;
        if (attempt === 3) {
          throw new ConflictException({
            code: 'COLLECTION_CONCURRENCY_CONFLICT',
            message:
              'The route collection could not be completed after concurrent retries',
          });
        }
      }
    }

    throw new ConflictException({
      code: 'COLLECTION_CONCURRENCY_CONFLICT',
      message:
        'The route collection could not be completed after concurrent retries',
    });
  }

  private isSerializableConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }

  private isIdempotencyUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isStaleVersionError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2025'
    );
  }

  private assertSameIdempotencyPayload(
    existingHash: string | null | undefined,
    expectedHash: string,
    message: string,
  ): void {
    if (existingHash !== expectedHash) {
      throw new ConflictException(message);
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
      notes: 'notes' in dto ? (dto.notes?.trim() ?? null) : undefined,
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
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) return 0;
    return Number(value.toString());
  }

  private toNumberOrNull(value: DecimalLike): number | null {
    if (value === null || value === undefined) return null;
    const parsed = this.toNumber(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private coordinatePair(
    latitude: DecimalLike,
    longitude: DecimalLike,
  ): { latitude: number; longitude: number } | null {
    const parsedLatitude = this.toNumberOrNull(latitude);
    const parsedLongitude = this.toNumberOrNull(longitude);
    return parsedLatitude === null || parsedLongitude === null
      ? null
      : { latitude: parsedLatitude, longitude: parsedLongitude };
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }
}
