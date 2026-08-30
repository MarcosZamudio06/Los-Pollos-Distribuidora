import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryRouteStatus, DeliveryRouteType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  FleetLiveQueryDto,
  FleetHeatmapMetric,
  FleetHeatmapQueryDto,
  MAX_FLEET_HEATMAP_FEATURES,
  FleetRoutePositionsQueryDto,
  MAX_FLEET_POSITION_HISTORY_LIMIT,
  PublishFleetPositionDto,
} from './dto';
import { FleetGateway } from './fleet.gateway';
import { GeofenceService, type GeofenceTransition } from './geofence.service';
import type {
  FleetGeofenceEventPayload,
  FleetPositionUpdatedPayload,
} from './fleet-realtime.types';

const DEFAULT_STALE_SECONDS = 60;
const DEFAULT_FUTURE_TOLERANCE_SECONDS = 300;
const DEFAULT_HISTORY_LIMIT = 500;
const DEFAULT_ANALYTICS_MAX_RANGE_DAYS = 31;
const HEATMAP_GRID_SIZE_METERS = 250;

type Actor = Pick<AuthenticatedUser, 'id' | 'role' | 'permissions'>;
type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type RouteForPosition = {
  id: string;
  driverId: string;
  vehicleId: string | null;
  status: DeliveryRouteStatus;
  originLocationId: string | null;
  vehicle: {
    id: string;
    code: string;
    displayName: string;
    plateNumber: string | null;
    isActive: boolean;
  } | null;
};

type PositionRow = {
  id: string;
  clientEventId: string;
  vehicleId: string;
  routeId: string;
  driverId: string;
  latitude: DecimalLike;
  longitude: DecimalLike;
  accuracyMeters: DecimalLike;
  speedKph: DecimalLike;
  headingDegrees: DecimalLike;
  recordedAt: Date | string;
  receivedAt: Date | string;
  positionPoint?: unknown;
};

type LiveRow = {
  vehicleId: string;
  vehicleCode: string;
  vehicleDisplayName: string;
  vehiclePlateNumber: string | null;
  driverName: string;
  driverId: string;
  routeId: string;
  routeName: string;
  routeType?: DeliveryRouteType;
  inventoryTransferId: string | null;
  routeStatus: DeliveryRouteStatus;
  scheduledDate: Date | string;
  originLocationId: string | null;
  routeGeometry: unknown;
  latitude: DecimalLike;
  longitude: DecimalLike;
  accuracyMeters: DecimalLike;
  speedKph: DecimalLike;
  headingDegrees: DecimalLike;
  positionRecordedAt: Date | string | null;
  nextStop: unknown;
  deliveryStops: unknown;
  totalOrdersCount: number | string | null;
  deliveredOrdersCount: number | string | null;
  incidentCountActive: number | string | null;
  incidents: unknown;
};

type HeatmapRow = {
  longitude: DecimalLike;
  latitude: DecimalLike;
  count: number | string;
  weight: number | string;
};

type NormalizedPosition = {
  clientEventId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  recordedAt: Date;
};

type PositionInsertResult = {
  row: PositionRow;
  inserted: boolean;
  geofenceTransitions: GeofenceTransition[];
};

@Injectable()
export class FleetService {
  private readonly logger = new Logger(FleetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly fleetGateway?: FleetGateway,
    @Optional() private readonly geofenceService?: GeofenceService,
  ) {}

  async publishPosition(dto: PublishFleetPositionDto, currentUser: Actor) {
    this.assertPositionPublisher(currentUser);
    const payload = this.normalizePosition(dto);
    const route = await this.resolveRouteForPosition(currentUser.id);
    const result = await this.insertOrReplayPosition(payload, route);
    if (result.inserted) {
      this.publishPositionUpdated(result.row, route);
      this.publishGeofenceTransitions(
        result.geofenceTransitions,
        route.originLocationId,
      );
    }

    const row = result.row;

    return {
      id: row.id,
      vehicleId: row.vehicleId,
      routeId: row.routeId,
      recordedAt: this.toIso(row.recordedAt),
      receivedAt: this.toIso(row.receivedAt),
    };
  }

  async getLive(query: FleetLiveQueryDto = {}, currentUser: Actor) {
    this.assertFleetViewer(currentUser);
    const serverTime = new Date();
    const filters: Prisma.Sql[] = [
      Prisma.sql`r."status" = ${DeliveryRouteStatus.IN_PROGRESS}::"DeliveryRouteStatus"`,
      Prisma.sql`v."isActive" = TRUE`,
    ];

    if (query.originLocationId?.trim()) {
      filters.push(
        Prisma.sql`r."originLocationId" = ${query.originLocationId.trim()}`,
      );
    }
    if (query.routeId?.trim()) {
      filters.push(Prisma.sql`r."id" = ${query.routeId.trim()}`);
    }

    const rows = await this.prisma.$queryRaw<LiveRow[]>(Prisma.sql`
      SELECT
        r."vehicleId",
        v."code" AS "vehicleCode",
        v."displayName" AS "vehicleDisplayName",
        v."plateNumber" AS "vehiclePlateNumber",
        d."id" AS "driverId",
        d."name" AS "driverName",
        r."id" AS "routeId",
        r."name" AS "routeName",
        r."type" AS "routeType",
        r."inventoryTransferId",
        r."status" AS "routeStatus",
        r."scheduledDate",
        r."originLocationId",
        r."geometry" AS "routeGeometry",
        latest."latitude",
        latest."longitude",
        latest."accuracyMeters",
        latest."speedKph",
        latest."headingDegrees",
        latest."positionRecordedAt",
        next_stop."nextStop",
        COALESCE(delivery_summary."deliveryStops", '[]'::json) AS "deliveryStops",
        COALESCE(delivery_summary."totalOrdersCount", 0)::int AS "totalOrdersCount",
        COALESCE(delivery_summary."deliveredOrdersCount", 0)::int AS "deliveredOrdersCount",
        COALESCE(incident_summary."incidentCountActive", 0)::int AS "incidentCountActive",
        COALESCE(incident_summary."incidents", '[]'::json) AS "incidents"
      FROM "DeliveryRoute" r
      INNER JOIN "Vehicle" v ON v."id" = r."vehicleId"
      INNER JOIN "User" d ON d."id" = r."driverId"
      LEFT JOIN LATERAL (
        SELECT
          vp."latitude",
          vp."longitude",
          vp."accuracyMeters",
          vp."speedKph",
          vp."headingDegrees",
          vp."recordedAt" AS "positionRecordedAt"
        FROM "VehiclePosition" vp
        WHERE vp."routeId" = r."id"
          AND vp."vehicleId" = r."vehicleId"
        ORDER BY vp."recordedAt" DESC, vp."receivedAt" DESC, vp."id" DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_build_object(
          'id', next_order."id",
          'saleId', next_order."saleId",
          'stopSequence', next_order."stopSequence",
          'deliveryAddress', next_order."deliveryAddress",
          'status', next_order."status",
          'latitude', next_order."latitude",
          'longitude', next_order."longitude"
        ) AS "nextStop"
        FROM "DeliveryOrder" next_order
        WHERE next_order."routeId" = r."id"
          AND next_order."status" NOT IN (
            'DELIVERED',
            'NOT_DELIVERED',
            'CANCELLED',
            'PARTIALLY_REJECTED',
            'RETURNED'
          )
        ORDER BY next_order."stopSequence" ASC NULLS LAST, next_order."createdAt" ASC
        LIMIT 1
      ) next_stop ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS "totalOrdersCount",
          COUNT(*) FILTER (WHERE orders."status" = 'DELIVERED')::int AS "deliveredOrdersCount",
          json_agg(
            json_build_object(
              'id', orders."id",
              'saleId', orders."saleId",
              'stopSequence', orders."stopSequence",
              'deliveryAddress', orders."deliveryAddress",
              'status', orders."status",
              'latitude', orders."latitude",
              'longitude', orders."longitude"
            )
            ORDER BY orders."stopSequence" ASC NULLS LAST, orders."createdAt" ASC
          ) AS "deliveryStops"
        FROM "DeliveryOrder" orders
        WHERE orders."routeId" = r."id"
      ) delivery_summary ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE incidents."status" IN ('OPEN', 'IN_REVIEW')
          )::int AS "incidentCountActive",
          COALESCE(
            json_agg(
              json_build_object(
                'incidentId', incidents."id",
                'deliveryOrderId', incidents."deliveryOrderId",
                'routeId', incidents."routeId",
                'vehicleId', incidents."vehicleId",
                'driverId', incidents."driverId",
                'status', incidents."status",
                'statusSnapshot', incidents."statusSnapshot",
                'reason', incidents."reason",
                'occurredAt', incidents."occurredAt",
                'position', CASE
                  WHEN incidents."latitude" IS NULL OR incidents."longitude" IS NULL THEN NULL
                  ELSE json_build_object(
                    'latitude', incidents."latitude",
                    'longitude', incidents."longitude"
                  )
                END,
                'stop', CASE
                  WHEN incident_order."latitude" IS NULL OR incident_order."longitude" IS NULL THEN NULL
                  ELSE json_build_object(
                    'latitude', incident_order."latitude",
                    'longitude', incident_order."longitude"
                  )
                END
              )
              ORDER BY incidents."occurredAt" DESC
            ) FILTER (WHERE incidents."id" IS NOT NULL),
            '[]'::json
          ) AS "incidents"
        FROM "DeliveryIncident" incidents
        LEFT JOIN "DeliveryOrder" incident_order
          ON incident_order."id" = incidents."deliveryOrderId"
        WHERE incidents."routeId" = r."id"
          AND incidents."status" IN ('OPEN', 'IN_REVIEW')
      ) incident_summary ON TRUE
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY v."displayName" ASC, r."vehicleId" ASC
    `);

    const staleAfterMs =
      this.getConfigNumber(
        'FLEET_POSITION_STALE_SECONDS',
        DEFAULT_STALE_SECONDS,
      ) * 1000;

    return {
      serverTime: serverTime.toISOString(),
      items: rows.map((row) => {
        const recordedAt = row.positionRecordedAt
          ? this.toDate(row.positionRecordedAt)
          : null;
        return {
          vehicle: {
            id: row.vehicleId,
            code: row.vehicleCode,
            displayName: row.vehicleDisplayName,
            plateNumber: row.vehiclePlateNumber,
          },
          driver: { id: row.driverId, name: row.driverName },
          route: {
            id: row.routeId,
            name: row.routeName,
            type: row.routeType ?? DeliveryRouteType.SALE_DELIVERY,
            inventoryTransferId: row.inventoryTransferId ?? null,
            status: row.routeStatus,
            scheduledDate: this.toIso(row.scheduledDate),
            originLocationId: row.originLocationId,
            geometry: this.parseJsonObject(row.routeGeometry),
            totalOrders: this.toInteger(row.totalOrdersCount),
            deliveredOrders: this.toInteger(row.deliveredOrdersCount),
            incidentCountActive: this.toInteger(row.incidentCountActive),
          },
          position: recordedAt
            ? {
                latitude: this.toNumber(row.latitude),
                longitude: this.toNumber(row.longitude),
                accuracyMeters: this.toNumberOrNull(row.accuracyMeters),
                speedKph: this.toNumberOrNull(row.speedKph),
                headingDegrees: this.toNumberOrNull(row.headingDegrees),
                recordedAt: recordedAt.toISOString(),
              }
            : null,
          stale:
            !recordedAt ||
            serverTime.getTime() - recordedAt.getTime() > staleAfterMs,
          nextStop: this.parseJsonObject(row.nextStop),
          deliveryStops: this.parseJsonArray(row.deliveryStops),
          incidents: this.parseJsonArray(row.incidents),
          incidentCountActive: this.toInteger(row.incidentCountActive),
        };
      }),
    };
  }

  async getHeatmap(query: FleetHeatmapQueryDto, currentUser: Actor) {
    this.assertFleetViewer(currentUser);
    const { metric, from, to } = this.normalizeHeatmapQuery(query);
    const filters = {
      originLocationId: query.originLocationId?.trim() || undefined,
      vehicleId: query.vehicleId?.trim() || undefined,
      routeId: query.routeId?.trim() || undefined,
    };

    const rows =
      metric === FleetHeatmapMetric.DELIVERIES
        ? await this.queryDeliveryHeatmap(from, to, filters)
        : await this.queryIncidentHeatmap(from, to, filters);

    return {
      type: 'FeatureCollection' as const,
      features: rows.map((row) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [
            this.toNumber(row.longitude),
            this.toNumber(row.latitude),
          ] as [number, number],
        },
        properties: {
          weight: this.toInteger(row.weight),
          count: this.toInteger(row.count),
          metric,
        },
      })),
    };
  }

  async getRoutePositions(
    routeId: string,
    query: FleetRoutePositionsQueryDto = {},
    currentUser: Actor,
  ) {
    const route = await this.prisma.deliveryRoute.findUnique({
      where: { id: routeId },
      select: { id: true, driverId: true },
    });
    if (!route) throw new NotFoundException('Delivery route not found');
    this.assertHistoryViewer(currentUser, route.driverId);

    const from = query.from ? this.parseDate(query.from, 'from') : undefined;
    const to = query.to ? this.parseDate(query.to, 'to') : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from cannot be later than to');
    }

    const limit = query.limit ?? DEFAULT_HISTORY_LIMIT;
    if (limit < 1 || limit > MAX_FLEET_POSITION_HISTORY_LIMIT) {
      throw new BadRequestException(
        `limit must be between 1 and ${MAX_FLEET_POSITION_HISTORY_LIMIT}`,
      );
    }

    const filters: Prisma.Sql[] = [Prisma.sql`"routeId" = ${routeId}`];
    if (from) filters.push(Prisma.sql`"recordedAt" >= ${from}`);
    if (to) filters.push(Prisma.sql`"recordedAt" <= ${to}`);

    const rows = await this.prisma.$queryRaw<PositionRow[]>(Prisma.sql`
      SELECT
        "id",
        "clientEventId",
        "vehicleId",
        "routeId",
        "driverId",
        "latitude",
        "longitude",
        ST_AsGeoJSON("positionPoint")::json AS "positionPoint",
        "accuracyMeters",
        "speedKph",
        "headingDegrees",
        "recordedAt",
        "receivedAt"
      FROM "VehiclePosition"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY "recordedAt" ASC, "id" ASC
      LIMIT ${limit}
    `);

    return {
      items: rows.map((row) => ({
        id: row.id,
        clientEventId: row.clientEventId,
        routeId: row.routeId,
        vehicleId: row.vehicleId,
        driverId: row.driverId,
        positionPoint: this.parseJsonObject(row.positionPoint),
        latitude: this.toNumber(row.latitude),
        longitude: this.toNumber(row.longitude),
        accuracyMeters: this.toNumberOrNull(row.accuracyMeters),
        speedKph: this.toNumberOrNull(row.speedKph),
        headingDegrees: this.toNumberOrNull(row.headingDegrees),
        recordedAt: this.toIso(row.recordedAt),
        receivedAt: this.toIso(row.receivedAt),
      })),
      limit,
      from: query.from ?? null,
      to: query.to ?? null,
    };
  }

  private assertPositionPublisher(currentUser: Actor): void {
    if (
      currentUser.role !== 'DRIVER' ||
      !currentUser.permissions?.includes(PERMISSIONS.FLEET_POSITION_PUBLISH)
    ) {
      throw new ForbiddenException(
        'Only an authenticated driver can publish fleet positions',
      );
    }
  }

  private normalizeHeatmapQuery(query: FleetHeatmapQueryDto): {
    metric: FleetHeatmapMetric;
    from: Date;
    to: Date;
  } {
    if (
      !query?.metric ||
      !Object.values(FleetHeatmapMetric).includes(query.metric)
    ) {
      throw new BadRequestException('metric must be DELIVERIES or INCIDENTS');
    }
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    if (from > to) {
      throw new BadRequestException('from cannot be later than to');
    }

    const maxRangeDays = this.getConfigNumber(
      'FLEET_ANALYTICS_MAX_RANGE_DAYS',
      DEFAULT_ANALYTICS_MAX_RANGE_DAYS,
    );
    if (to.getTime() - from.getTime() > maxRangeDays * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        `heatmap range cannot exceed ${maxRangeDays} days`,
      );
    }

    return { metric: query.metric, from, to };
  }

  private queryDeliveryHeatmap(
    from: Date,
    to: Date,
    filters: {
      originLocationId?: string;
      vehicleId?: string;
      routeId?: string;
    },
  ): Promise<HeatmapRow[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`orders."status" = 'DELIVERED'::"DeliveryOrderStatus"`,
      Prisma.sql`orders."deliveredAt" >= ${from}`,
      Prisma.sql`orders."deliveredAt" <= ${to}`,
      Prisma.sql`orders."latitude" IS NOT NULL`,
      Prisma.sql`orders."longitude" IS NOT NULL`,
      Prisma.sql`orders."latitude" BETWEEN -90 AND 90`,
      Prisma.sql`orders."longitude" BETWEEN -180 AND 180`,
    ];
    this.appendHeatmapRouteFilters(conditions, filters);

    return this.prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
      WITH points AS (
        SELECT ST_SetSRID(
          ST_MakePoint(
            orders."longitude"::double precision,
            orders."latitude"::double precision
          ),
          4326
        ) AS point
        FROM "DeliveryOrder" orders
        INNER JOIN "DeliveryRoute" routes
          ON routes."id" = orders."routeId"
        WHERE ${Prisma.join(conditions, ' AND ')}
      ), cells AS (
        SELECT ST_SnapToGrid(
          ST_Transform(point, 3857),
          ${HEATMAP_GRID_SIZE_METERS}
        ) AS cell
        FROM points
      )
      SELECT
        ST_X(ST_Transform(cell, 4326)) AS "longitude",
        ST_Y(ST_Transform(cell, 4326)) AS "latitude",
        COUNT(*)::int AS "count",
        COUNT(*)::int AS "weight"
      FROM cells
      GROUP BY cell
      ORDER BY COUNT(*) DESC, "longitude" ASC, "latitude" ASC
      LIMIT ${MAX_FLEET_HEATMAP_FEATURES}
    `);
  }

  private queryIncidentHeatmap(
    from: Date,
    to: Date,
    filters: {
      originLocationId?: string;
      vehicleId?: string;
      routeId?: string;
    },
  ): Promise<HeatmapRow[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`incidents."occurredAt" >= ${from}`,
      Prisma.sql`incidents."occurredAt" <= ${to}`,
      Prisma.sql`incidents."latitude" IS NOT NULL`,
      Prisma.sql`incidents."longitude" IS NOT NULL`,
      Prisma.sql`incidents."latitude" BETWEEN -90 AND 90`,
      Prisma.sql`incidents."longitude" BETWEEN -180 AND 180`,
    ];
    this.appendHeatmapRouteFilters(conditions, filters, true);

    return this.prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
      WITH points AS (
        SELECT ST_SetSRID(
          ST_MakePoint(
            incidents."longitude"::double precision,
            incidents."latitude"::double precision
          ),
          4326
        ) AS point
        FROM "DeliveryIncident" incidents
        LEFT JOIN "DeliveryOrder" incident_orders
          ON incident_orders."id" = incidents."deliveryOrderId"
        LEFT JOIN "DeliveryRoute" routes
          ON routes."id" = COALESCE(incidents."routeId", incident_orders."routeId")
        WHERE ${Prisma.join(conditions, ' AND ')}
      ), cells AS (
        SELECT ST_SnapToGrid(
          ST_Transform(point, 3857),
          ${HEATMAP_GRID_SIZE_METERS}
        ) AS cell
        FROM points
      )
      SELECT
        ST_X(ST_Transform(cell, 4326)) AS "longitude",
        ST_Y(ST_Transform(cell, 4326)) AS "latitude",
        COUNT(*)::int AS "count",
        COUNT(*)::int AS "weight"
      FROM cells
      GROUP BY cell
      ORDER BY COUNT(*) DESC, "longitude" ASC, "latitude" ASC
      LIMIT ${MAX_FLEET_HEATMAP_FEATURES}
    `);
  }

  private appendHeatmapRouteFilters(
    conditions: Prisma.Sql[],
    filters: {
      originLocationId?: string;
      vehicleId?: string;
      routeId?: string;
    },
    incidentQuery = false,
  ): void {
    if (filters.originLocationId) {
      conditions.push(
        Prisma.sql`routes."originLocationId" = ${filters.originLocationId}`,
      );
    }
    if (filters.vehicleId) {
      conditions.push(
        incidentQuery
          ? Prisma.sql`COALESCE(incidents."vehicleId", routes."vehicleId") = ${filters.vehicleId}`
          : Prisma.sql`routes."vehicleId" = ${filters.vehicleId}`,
      );
    }
    if (filters.routeId) {
      conditions.push(
        incidentQuery
          ? Prisma.sql`COALESCE(incidents."routeId", incident_orders."routeId") = ${filters.routeId}`
          : Prisma.sql`routes."id" = ${filters.routeId}`,
      );
    }
  }

  private assertFleetViewer(currentUser: Actor): void {
    if (
      currentUser.role !== 'ADMIN' &&
      !currentUser.permissions?.includes(PERMISSIONS.FLEET_VIEW)
    ) {
      throw new ForbiddenException('Fleet view permission is required');
    }
  }

  private assertHistoryViewer(currentUser: Actor, routeDriverId: string): void {
    if (currentUser.role === 'DRIVER') {
      if (
        routeDriverId === currentUser.id &&
        currentUser.permissions?.includes(PERMISSIONS.FLEET_VIEW)
      ) {
        return;
      }
      throw new ForbiddenException(
        'Drivers can only read their own route history with fleet.view',
      );
    }
    if (
      currentUser.role !== 'ADMIN' &&
      !currentUser.permissions?.includes(PERMISSIONS.FLEET_VIEW)
    ) {
      throw new ForbiddenException('Fleet view permission is required');
    }
  }

  private normalizePosition(dto: PublishFleetPositionDto): NormalizedPosition {
    const clientEventId = dto.clientEventId?.trim();
    if (!clientEventId) {
      throw new BadRequestException('clientEventId is required');
    }

    const latitude = this.validateNumber(dto.latitude, 'latitude', -90, 90);
    const longitude = this.validateNumber(
      dto.longitude,
      'longitude',
      -180,
      180,
    );
    const accuracyMeters = this.validateOptionalNumber(
      dto.accuracyMeters,
      'accuracyMeters',
      0,
    );
    const speedKph = this.validateOptionalNumber(dto.speedKph, 'speedKph', 0);
    const headingDegrees = this.validateOptionalNumber(
      dto.headingDegrees,
      'headingDegrees',
      0,
      359.999,
    );
    const recordedAt = this.parseDate(dto.recordedAt, 'recordedAt');
    const futureToleranceMs =
      this.getConfigNumber(
        'FLEET_POSITION_FUTURE_TOLERANCE_SECONDS',
        DEFAULT_FUTURE_TOLERANCE_SECONDS,
      ) * 1000;
    if (recordedAt.getTime() > Date.now() + futureToleranceMs) {
      throw new BadRequestException(
        'recordedAt cannot be farther in the future than the configured tolerance',
      );
    }

    return {
      clientEventId,
      latitude,
      longitude,
      accuracyMeters,
      speedKph,
      headingDegrees,
      recordedAt,
    };
  }

  private async resolveRouteForPosition(
    driverId: string,
  ): Promise<RouteForPosition> {
    const select = {
      id: true,
      driverId: true,
      vehicleId: true,
      status: true,
      originLocationId: true,
      vehicle: {
        select: {
          id: true,
          code: true,
          displayName: true,
          plateNumber: true,
          isActive: true,
        },
      },
    } as const;

    const result = await this.prisma.deliveryRoute.findMany({
      where: {
        driverId,
        status: DeliveryRouteStatus.IN_PROGRESS,
      },
      select,
      orderBy: { id: 'asc' },
      take: 2,
    });
    const routes = (
      Array.isArray(result) ? result : result ? [result] : []
    ) as RouteForPosition[];
    if (routes.length === 0) {
      throw new NotFoundException('No active delivery route was found');
    }
    if (routes.length > 1) {
      throw new ConflictException(
        'The driver has more than one active delivery route',
      );
    }
    const route = routes[0];

    if (route.driverId !== driverId) {
      throw new ForbiddenException(
        'The delivery route does not belong to the authenticated driver',
      );
    }
    if (route.status !== DeliveryRouteStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Fleet positions are accepted only for in-progress routes',
      );
    }
    if (!route.vehicleId || !route.vehicle) {
      throw new BadRequestException(
        'The active delivery route must have an assigned vehicle',
      );
    }
    if (!route.vehicle.isActive) {
      throw new BadRequestException('The assigned vehicle is inactive');
    }
    if (route.vehicle.id !== route.vehicleId) {
      throw new ConflictException('The route vehicle assignment is invalid');
    }
    return route;
  }

  private async insertOrReplayPosition(
    payload: NormalizedPosition,
    route: RouteForPosition,
  ): Promise<PositionInsertResult> {
    const operation = async (
      client: Prisma.TransactionClient,
    ): Promise<PositionInsertResult> => {
      const inserted = await client.$queryRaw<PositionRow[]>(Prisma.sql`
        INSERT INTO "VehiclePosition" (
          "id",
          "clientEventId",
          "vehicleId",
          "routeId",
          "driverId",
          "latitude",
          "longitude",
          "accuracyMeters",
          "speedKph",
          "headingDegrees",
          "recordedAt"
        )
        VALUES (
          ${this.createPositionId()},
          ${payload.clientEventId},
          ${route.vehicleId},
          ${route.id},
          ${route.driverId},
          ${payload.latitude},
          ${payload.longitude},
          ${payload.accuracyMeters},
          ${payload.speedKph},
          ${payload.headingDegrees},
          ${payload.recordedAt}
        )
        ON CONFLICT ("clientEventId") DO NOTHING
        RETURNING
          "id",
          "clientEventId",
          "vehicleId",
          "routeId",
          "driverId",
          "latitude",
          "longitude",
          "accuracyMeters",
          "speedKph",
          "headingDegrees",
          "recordedAt",
          "receivedAt"
      `);
      if (inserted[0]) {
        const geofenceTransitions = this.geofenceService
          ? await this.geofenceService.evaluatePosition(
              client,
              {
                id: inserted[0].id,
                vehicleId: inserted[0].vehicleId,
                routeId: inserted[0].routeId,
                recordedAt: this.toDate(inserted[0].recordedAt),
              },
              route,
            )
          : [];
        return {
          row: inserted[0],
          inserted: true,
          geofenceTransitions,
        };
      }

      const replay = await client.$queryRaw<PositionRow[]>(Prisma.sql`
        SELECT
          "id",
          "clientEventId",
          "vehicleId",
          "routeId",
          "driverId",
          "latitude",
          "longitude",
          "accuracyMeters",
          "speedKph",
          "headingDegrees",
          "recordedAt",
          "receivedAt"
        FROM "VehiclePosition"
        WHERE "clientEventId" = ${payload.clientEventId}
        LIMIT 1
      `);
      const existing = replay[0];
      if (!existing) {
        throw new ConflictException(
          'The fleet position could not be inserted or replayed',
        );
      }
      if (
        existing.routeId !== route.id ||
        existing.vehicleId !== route.vehicleId ||
        existing.driverId !== route.driverId
      ) {
        throw new ConflictException(
          'clientEventId is already associated with another assignment',
        );
      }
      return { row: existing, inserted: false, geofenceTransitions: [] };
    };

    return this.prisma.$transaction(operation);
  }

  private publishPositionUpdated(
    row: PositionRow,
    route: RouteForPosition,
  ): void {
    if (!this.fleetGateway) return;

    const payload: FleetPositionUpdatedPayload = {
      vehicleId: row.vehicleId,
      vehicleCode: route.vehicle?.code ?? '',
      routeId: row.routeId,
      driverId: row.driverId,
      originLocationId: route.originLocationId ?? null,
      latitude: this.toNumber(row.latitude),
      longitude: this.toNumber(row.longitude),
      accuracyMeters: this.toNumberOrNull(row.accuracyMeters),
      speedKph: this.toNumberOrNull(row.speedKph),
      headingDegrees: this.toNumberOrNull(row.headingDegrees),
      recordedAt: this.toIso(row.recordedAt),
    };

    try {
      this.fleetGateway.emitPositionUpdated(payload);
    } catch (error) {
      this.logger.error(
        `Unable to publish fleet.position.updated for position ${row.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private publishGeofenceTransitions(
    transitions: GeofenceTransition[],
    originLocationId: string | null,
  ): void {
    if (!this.fleetGateway) return;

    for (const transition of transitions) {
      const payload: FleetGeofenceEventPayload = {
        eventId: transition.id,
        type: transition.type,
        zoneId: transition.zoneId,
        zoneName: transition.zoneName,
        vehicleId: transition.vehicleId,
        vehicleCode: transition.vehicleCode,
        routeId: transition.routeId,
        latitude: transition.latitude,
        longitude: transition.longitude,
        occurredAt: this.toIso(transition.occurredAt),
      };

      try {
        if (transition.type === 'ENTER') {
          this.fleetGateway.emitGeofenceEntered(payload, originLocationId);
        } else {
          this.fleetGateway.emitGeofenceExited(payload, originLocationId);
        }
      } catch (error) {
        this.logger.error(
          `Unable to publish geofence transition ${transition.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private validateNumber(
    value: number,
    field: string,
    minimum: number,
    maximum: number,
  ): number {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new BadRequestException(`${field} is outside the allowed range`);
    }
    return value;
  }

  private validateOptionalNumber(
    value: number | undefined,
    field: string,
    minimum: number,
    maximum = Number.POSITIVE_INFINITY,
  ): number | null {
    if (value === undefined || value === null) return null;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new BadRequestException(`${field} is outside the allowed range`);
    }
    return value;
  }

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);
    if (!value || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO-8601 date`);
    }
    return parsed;
  }

  private getConfigNumber(key: string, fallback: number): number {
    const value = this.config.get<number | string>(key);
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private createPositionId(): string {
    return `c${Date.now().toString(36)}${randomUUID().replaceAll('-', '')}`;
  }

  private toNumber(value: DecimalLike): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toNumberOrNull(value: DecimalLike): number | null {
    if (value === null || value === undefined) return null;
    return this.toNumber(value);
  }

  private toInteger(value: number | string | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private toIso(value: Date | string): string {
    return this.toDate(value).toISOString();
  }

  private parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) return null;
    const parsed =
      typeof value === 'string' ? this.parseJsonString(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  }

  private parseJsonArray(value: unknown): unknown[] {
    if (value === null || value === undefined) return [];
    const parsed =
      typeof value === 'string' ? this.parseJsonString(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  }

  private parseJsonString(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
