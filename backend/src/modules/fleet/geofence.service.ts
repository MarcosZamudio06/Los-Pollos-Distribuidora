import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GeofenceEventType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateDeliveryZoneDto,
  MAX_DELIVERY_ZONE_LIST_LIMIT,
  MAX_GEOFENCE_EVENT_LIST_LIMIT,
  ListDeliveryZonesQueryDto,
  ListGeofenceEventsQueryDto,
  UpdateDeliveryZoneDto,
} from './dto';

type Actor = Pick<AuthenticatedUser, 'id' | 'role' | 'permissions'>;
type DatabaseClient = PrismaService | Prisma.TransactionClient;

type PolygonGeometry = {
  type: 'Polygon';
  coordinates: number[][][];
};

type ZoneRecord = {
  id: string;
  name: string;
  originLocationId: string;
  geometry: unknown;
  isActive: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type ZoneEvaluationRow = {
  id: string;
  name: string;
  isInside: boolean | string;
  vehicleCode?: string | null;
  latitude?: DecimalLike;
  longitude?: DecimalLike;
};

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type GeofenceStateRow = {
  vehicleId: string;
  zoneId: string;
  isInside: boolean;
  lastPositionId: string | null;
  updatedAt: Date;
};

type GeofenceEventRow = {
  id: string;
  zoneId: string;
  vehicleId: string;
  routeId: string;
  positionId: string;
  type: GeofenceEventType;
  occurredAt: Date;
};

export type GeofenceTransition = GeofenceEventRow & {
  zoneName: string;
  vehicleCode: string;
  latitude: number;
  longitude: number;
};

type PositionForGeofence = {
  id: string;
  vehicleId: string;
  routeId: string;
  recordedAt: Date;
};

const DEFAULT_ZONE_PAGE = 1;
const DEFAULT_ZONE_LIMIT = 20;
const DEFAULT_EVENT_PAGE = 1;
const DEFAULT_EVENT_LIMIT = 50;

@Injectable()
export class GeofenceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateDeliveryZoneDto,
    currentUser: Actor,
  ): Promise<ReturnType<GeofenceService['toZoneResponse']>> {
    this.assertZoneManager(currentUser);
    const name = this.normalizeName(dto.name);
    const originLocationId = this.normalizeId(
      dto.originLocationId,
      'originLocationId',
    );
    const geometry = this.validatePolygon(dto.geometry);

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveOrigin(originLocationId, tx);
      await this.assertPostgisGeometry(tx, geometry);

      const rows = await tx.$queryRaw<ZoneRecord[]>(Prisma.sql`
        INSERT INTO "DeliveryZone" (
          "id",
          "name",
          "originLocationId",
          "geometry",
          "zoneGeometry",
          "isActive",
          "createdByUserId",
          "updatedByUserId",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${this.createId('zone')},
          ${name},
          ${originLocationId},
          ${JSON.stringify(geometry)}::jsonb,
          ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326),
          TRUE,
          ${currentUser.id},
          ${currentUser.id},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING
          "id",
          "name",
          "originLocationId",
          "geometry",
          "isActive",
          "createdByUserId",
          "updatedByUserId",
          "createdAt",
          "updatedAt"
      `);

      const zone = rows[0];
      if (!zone) {
        throw new UnprocessableEntityException(
          'The delivery zone could not be persisted',
        );
      }
      return this.toZoneResponse(zone);
    });
  }

  async findAll(query: ListDeliveryZonesQueryDto = {}, currentUser: Actor) {
    this.assertFleetViewer(currentUser);
    const page = query.page ?? DEFAULT_ZONE_PAGE;
    const limit = query.limit ?? DEFAULT_ZONE_LIMIT;
    this.assertPagination(page, limit, MAX_DELIVERY_ZONE_LIST_LIMIT);
    const active = query.active ?? query.isActive;
    const originLocationId = query.originLocationId?.trim();
    const search = query.search?.trim();
    const where = {
      ...(active === undefined ? {} : { isActive: active }),
      ...(originLocationId ? { originLocationId } : {}),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.deliveryZone.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          originLocationId: true,
          geometry: true,
          isActive: true,
          createdByUserId: true,
          updatedByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.deliveryZone.count({ where }),
    ]);

    return {
      items: (items as unknown as ZoneRecord[]).map((zone) =>
        this.toZoneResponse(zone),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(
    id: string,
    dto: UpdateDeliveryZoneDto,
    currentUser: Actor,
  ): Promise<ReturnType<GeofenceService['toZoneResponse']>> {
    this.assertZoneManager(currentUser);
    const zoneId = this.normalizeId(id, 'id');
    if (
      dto.name === undefined &&
      dto.originLocationId === undefined &&
      dto.geometry === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException(
        'At least one delivery zone field is required',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const current = (await tx.deliveryZone.findUnique({
        where: { id: zoneId },
        select: {
          id: true,
          name: true,
          originLocationId: true,
          geometry: true,
          isActive: true,
          createdByUserId: true,
          updatedByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      })) as ZoneRecord | null;

      if (!current) throw new NotFoundException('Delivery zone not found');

      const name =
        dto.name === undefined ? current.name : this.normalizeName(dto.name);
      const originLocationId =
        dto.originLocationId === undefined
          ? current.originLocationId
          : this.normalizeId(dto.originLocationId, 'originLocationId');
      const geometry =
        dto.geometry === undefined
          ? undefined
          : this.validatePolygon(dto.geometry);
      const isActive = dto.isActive ?? current.isActive;

      if (
        originLocationId !== current.originLocationId ||
        (dto.isActive === true && !current.isActive)
      ) {
        await this.assertActiveOrigin(originLocationId, tx);
      }
      if (geometry) await this.assertPostgisGeometry(tx, geometry);

      const rows = geometry
        ? await tx.$queryRaw<ZoneRecord[]>(Prisma.sql`
            UPDATE "DeliveryZone"
            SET
              "name" = ${name},
              "originLocationId" = ${originLocationId},
              "geometry" = ${JSON.stringify(geometry)}::jsonb,
              "zoneGeometry" = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326),
              "isActive" = ${isActive},
              "updatedByUserId" = ${currentUser.id},
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${zoneId}
            RETURNING
              "id", "name", "originLocationId", "geometry", "isActive",
              "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"
          `)
        : await tx.$queryRaw<ZoneRecord[]>(Prisma.sql`
            UPDATE "DeliveryZone"
            SET
              "name" = ${name},
              "originLocationId" = ${originLocationId},
              "isActive" = ${isActive},
              "updatedByUserId" = ${currentUser.id},
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${zoneId}
            RETURNING
              "id", "name", "originLocationId", "geometry", "isActive",
              "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"
          `);

      const updated = rows[0];
      if (!updated) throw new NotFoundException('Delivery zone not found');
      return this.toZoneResponse(updated);
    });
  }

  async findEvents(query: ListGeofenceEventsQueryDto = {}, currentUser: Actor) {
    this.assertFleetViewer(currentUser);
    const page = query.page ?? DEFAULT_EVENT_PAGE;
    const limit = query.limit ?? DEFAULT_EVENT_LIMIT;
    this.assertPagination(page, limit, MAX_GEOFENCE_EVENT_LIST_LIMIT);
    const from = query.from ? this.parseDate(query.from, 'from') : undefined;
    const to = query.to ? this.parseDate(query.to, 'to') : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from cannot be later than to');
    }

    const where = {
      ...(query.vehicleId?.trim() ? { vehicleId: query.vehicleId.trim() } : {}),
      ...(query.zoneId?.trim() ? { zoneId: query.zoneId.trim() } : {}),
      ...(query.routeId?.trim() ? { routeId: query.routeId.trim() } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.geofenceEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          zoneId: true,
          vehicleId: true,
          routeId: true,
          positionId: true,
          type: true,
          occurredAt: true,
          createdAt: true,
          zone: { select: { name: true } },
          vehicle: { select: { code: true, displayName: true } },
          route: { select: { name: true } },
        },
      }),
      this.prisma.geofenceEvent.count({ where }),
    ]);

    return {
      items: items.map((event) => ({
        id: event.id,
        zoneId: event.zoneId,
        vehicleId: event.vehicleId,
        routeId: event.routeId,
        positionId: event.positionId,
        type: event.type,
        occurredAt: event.occurredAt,
        createdAt: event.createdAt,
        zone: event.zone,
        vehicle: event.vehicle,
        route: event.route,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async evaluatePosition(
    tx: Prisma.TransactionClient,
    position: PositionForGeofence,
    route: { originLocationId: string | null },
  ): Promise<GeofenceTransition[]> {
    if (!route.originLocationId) return [];

    const zones = await tx.$queryRaw<ZoneEvaluationRow[]>(Prisma.sql`
      SELECT
        z."id",
        z."name",
        ST_Covers(z."zoneGeometry", vp."positionPoint") AS "isInside",
        v."code" AS "vehicleCode",
        vp."latitude",
        vp."longitude"
      FROM "DeliveryZone" z
      INNER JOIN "VehiclePosition" vp
        ON vp."id" = ${position.id}
      INNER JOIN "Vehicle" v
        ON v."id" = vp."vehicleId"
      WHERE z."originLocationId" = ${route.originLocationId}
        AND z."isActive" = TRUE
      ORDER BY z."id" ASC
    `);

    const transitions: GeofenceTransition[] = [];
    for (const zone of zones) {
      const isInside = this.toBoolean(zone.isInside);
      const insertedState = await tx.$queryRaw<GeofenceStateRow[]>(Prisma.sql`
        INSERT INTO "VehicleGeofenceState" (
          "vehicleId", "zoneId", "isInside", "lastPositionId", "updatedAt"
        )
        VALUES (
          ${position.vehicleId}, ${zone.id}, ${isInside}, ${position.id}, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("vehicleId", "zoneId") DO NOTHING
        RETURNING "vehicleId", "zoneId", "isInside", "lastPositionId", "updatedAt"
      `);

      const previousState = insertedState[0]
        ? null
        : (
            await tx.$queryRaw<GeofenceStateRow[]>(Prisma.sql`
              SELECT "vehicleId", "zoneId", "isInside", "lastPositionId", "updatedAt"
              FROM "VehicleGeofenceState"
              WHERE "vehicleId" = ${position.vehicleId}
                AND "zoneId" = ${zone.id}
              FOR UPDATE
            `)
          )[0];

      if (!previousState) {
        if (isInside) {
          const event = await this.insertTransition(
            tx,
            zone,
            position,
            GeofenceEventType.ENTER,
          );
          if (event) transitions.push(event);
        }
        continue;
      }

      if (previousState.isInside !== isInside) {
        const event = await this.insertTransition(
          tx,
          zone,
          position,
          isInside ? GeofenceEventType.ENTER : GeofenceEventType.EXIT,
        );
        if (event) transitions.push(event);
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "VehicleGeofenceState"
        SET
          "isInside" = ${isInside},
          "lastPositionId" = ${position.id},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "vehicleId" = ${position.vehicleId}
          AND "zoneId" = ${zone.id}
      `);
    }

    return transitions;
  }

  private async insertTransition(
    tx: Prisma.TransactionClient,
    zone: Pick<
      ZoneEvaluationRow,
      'id' | 'name' | 'vehicleCode' | 'latitude' | 'longitude'
    >,
    position: PositionForGeofence,
    type: GeofenceEventType,
  ): Promise<GeofenceTransition | null> {
    const rows = await tx.$queryRaw<GeofenceEventRow[]>(Prisma.sql`
      INSERT INTO "GeofenceEvent" (
        "id", "zoneId", "vehicleId", "routeId", "positionId", "type", "occurredAt"
      )
      VALUES (
        ${this.createId('event')},
        ${zone.id},
        ${position.vehicleId},
        ${position.routeId},
        ${position.id},
        ${type}::"GeofenceEventType",
        ${position.recordedAt}
      )
      ON CONFLICT ("zoneId", "positionId", "type") DO NOTHING
      RETURNING "id", "zoneId", "vehicleId", "routeId", "positionId", "type", "occurredAt"
    `);
    return rows[0]
      ? {
          ...rows[0],
          zoneName: zone.name,
          vehicleCode: zone.vehicleCode ?? '',
          latitude: this.toNumber(zone.latitude),
          longitude: this.toNumber(zone.longitude),
        }
      : null;
  }

  private async assertActiveOrigin(
    originLocationId: string,
    client: DatabaseClient,
  ): Promise<void> {
    const location = await client.operationalLocation.findFirst({
      where: { id: originLocationId, isActive: true },
      select: { id: true },
    });
    if (!location) {
      throw new UnprocessableEntityException(
        'The selected origin location is not active or does not exist',
      );
    }
  }

  private async assertPostgisGeometry(
    client: DatabaseClient,
    geometry: PolygonGeometry,
  ): Promise<void> {
    try {
      const rows = await client.$queryRaw<
        Array<{
          isValid: boolean;
          isEmpty: boolean;
          geometryType: string;
          srid: number;
        }>
      >(Prisma.sql`
        SELECT
          ST_IsValid(candidate."geom") AS "isValid",
          ST_IsEmpty(candidate."geom") AS "isEmpty",
          ST_GeometryType(candidate."geom") AS "geometryType",
          ST_SRID(candidate."geom") AS "srid"
        FROM (
          SELECT ST_SetSRID(
            ST_GeomFromGeoJSON(${JSON.stringify(geometry)}),
            4326
          ) AS "geom"
        ) candidate
      `);
      const candidate = rows[0];
      if (
        !candidate ||
        candidate.isEmpty ||
        !candidate.isValid ||
        candidate.geometryType !== 'ST_Polygon' ||
        candidate.srid !== 4326
      ) {
        throw new UnprocessableEntityException(
          'geometry must be a valid, non-empty Polygon in SRID 4326',
        );
      }
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new UnprocessableEntityException(
        'geometry must be a valid, non-empty Polygon in SRID 4326',
      );
    }
  }

  private validatePolygon(value: unknown): PolygonGeometry {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      (value as { type?: unknown }).type !== 'Polygon'
    ) {
      throw new UnprocessableEntityException(
        'geometry must be a GeoJSON Polygon',
      );
    }

    const coordinates = (value as { coordinates?: unknown }).coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      throw new UnprocessableEntityException(
        'geometry Polygon coordinates cannot be empty',
      );
    }

    const normalizedCoordinates = (coordinates as unknown[]).map(
      (ring: unknown, ringIndex) => {
        if (!Array.isArray(ring) || ring.length < 4) {
          throw new UnprocessableEntityException(
            `geometry ring ${ringIndex} must contain at least four coordinates`,
          );
        }

        const normalizedRing = (ring as unknown[]).map(
          (coordinate: unknown, coordinateIndex) => {
            if (!this.isCoordinate(coordinate)) {
              throw new UnprocessableEntityException(
                `geometry coordinate ${ringIndex}:${coordinateIndex} must be [longitude, latitude]`,
              );
            }

            const [longitude, latitude] = coordinate;
            if (
              longitude < -180 ||
              longitude > 180 ||
              latitude < -90 ||
              latitude > 90
            ) {
              throw new UnprocessableEntityException(
                `geometry coordinate ${ringIndex}:${coordinateIndex} is outside WGS84 bounds`,
              );
            }
            return [longitude, latitude] as [number, number];
          },
        );

        const first = normalizedRing[0];
        const last = normalizedRing[normalizedRing.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          throw new UnprocessableEntityException(
            `geometry ring ${ringIndex} must be closed`,
          );
        }

        const uniqueVertices = new Set(
          normalizedRing
            .slice(0, -1)
            .map(([longitude, latitude]) => `${longitude},${latitude}`),
        );
        if (uniqueVertices.size < 3) {
          throw new UnprocessableEntityException(
            `geometry ring ${ringIndex} must contain at least three vertices`,
          );
        }
        return normalizedRing;
      },
    );

    return { type: 'Polygon', coordinates: normalizedCoordinates };
  }

  private isCoordinate(value: unknown): value is [number, number] {
    return (
      Array.isArray(value) &&
      value.length === 2 &&
      value.every(
        (component) =>
          typeof component === 'number' && Number.isFinite(component),
      )
    );
  }

  private assertZoneManager(currentUser: Actor): void {
    if (
      currentUser.role !== 'ADMIN' &&
      !currentUser.permissions?.includes(PERMISSIONS.FLEET_ZONES_MANAGE)
    ) {
      throw new ForbiddenException(
        'Fleet zone management permission is required',
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

  private normalizeName(value: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new UnprocessableEntityException('name cannot be empty');
    }
    return normalized;
  }

  private normalizeId(value: string, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new UnprocessableEntityException(`${field} cannot be empty`);
    }
    return normalized;
  }

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);
    if (!value || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO-8601 date`);
    }
    return parsed;
  }

  private assertPagination(
    page: number,
    limit: number,
    maxLimit: number,
  ): void {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > maxLimit
    ) {
      throw new BadRequestException(
        `page must be an integer >= 1 and limit must be between 1 and ${maxLimit}`,
      );
    }
  }

  private toBoolean(value: boolean | string): boolean {
    return value === true || value === 't' || value === 'true';
  }

  private toNumber(value: DecimalLike): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toZoneResponse(zone: ZoneRecord) {
    return {
      id: zone.id,
      name: zone.name,
      originLocationId: zone.originLocationId,
      geometry: this.parseJson(zone.geometry),
      isActive: zone.isActive,
      createdBy: zone.createdByUserId,
      updatedBy: zone.updatedByUserId,
      createdByUserId: zone.createdByUserId,
      updatedByUserId: zone.updatedByUserId,
      createdAt: zone.createdAt,
      updatedAt: zone.updatedAt,
    };
  }

  private parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private createId(prefix: string): string {
    return `c${prefix}${Date.now().toString(36)}${randomUUID().replaceAll('-', '')}`;
  }
}
