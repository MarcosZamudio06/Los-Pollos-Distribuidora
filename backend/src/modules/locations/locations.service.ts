import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type OperationalLocationType } from '@prisma/client';
import {
  BranchSupplyCycleStatus,
  DeliveryRouteStatus,
  InventoryTransferStatus,
  PointOfSaleDailyCloseStatus,
  RouteSettlementStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateLocationDto,
  ListLocationsQueryDto,
  UpdateLocationDto,
} from './dto';

type LocationRecord = {
  id: string;
  name: string;
  code: string | null;
  type: OperationalLocationType;
  parentId: string | null;
  address: string | null;
  latitude: { toString(): string } | number | string | null;
  longitude: { toString(): string } | number | string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type LocationResponse = Omit<LocationRecord, 'latitude' | 'longitude'> & {
  latitude: number | null;
  longitude: number | null;
};

type LocationListResponse = { items: LocationResponse[] };
type LocationClient = PrismaService | Prisma.TransactionClient;

type LocationMutationDto = CreateLocationDto | UpdateLocationDto;
type LocationMutationData = Pick<
  LocationRecord,
  | 'name'
  | 'code'
  | 'type'
  | 'parentId'
  | 'address'
  | 'latitude'
  | 'longitude'
  | 'isActive'
>;
type LocationListActor = Pick<
  AuthenticatedUser,
  'role' | 'operationalLocationId'
>;

const SELLER_WITHOUT_LOCATION = '__seller_without_operational_location__';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    currentUser: LocationListActor,
    query: ListLocationsQueryDto = {},
  ): Promise<LocationListResponse> {
    const locations = (await this.prisma.operationalLocation.findMany({
      where: this.buildListWhere(query, currentUser),
      orderBy: { name: 'asc' },
      ...this.buildPagination(query),
    })) as LocationRecord[];

    return {
      items: locations.map((location) => this.toLocationResponse(location)),
    };
  }

  async findOne(
    id: string,
    currentUser: LocationListActor,
  ): Promise<LocationResponse> {
    const location = (await this.prisma.operationalLocation.findUnique({
      where: { id },
    })) as LocationRecord | null;

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    this.assertLocationReadScope(location, currentUser);

    return this.toLocationResponse(location);
  }

  async findActiveBranches(
    cedisId: string,
    currentUser: LocationListActor,
  ): Promise<LocationListResponse> {
    const cedis = (await this.prisma.operationalLocation.findUnique({
      where: { id: cedisId },
    })) as LocationRecord | null;

    if (
      !cedis ||
      cedis.type !== 'DISTRIBUTION_CENTER' ||
      !cedis.isActive ||
      (currentUser.role === 'WAREHOUSE' &&
        currentUser.operationalLocationId !== cedisId) ||
      !['ADMIN', 'WAREHOUSE'].includes(currentUser.role)
    ) {
      throw new NotFoundException('CEDIS not found');
    }

    const locations = (await this.prisma.operationalLocation.findMany({
      where: {
        parentId: cedisId,
        type: 'BRANCH',
        isActive: true,
      },
      orderBy: { name: 'asc' },
    })) as LocationRecord[];

    return {
      items: locations.map((location) => this.toLocationResponse(location)),
    };
  }

  async create(dto: CreateLocationDto): Promise<LocationResponse> {
    const data = this.normalizeMutationData(dto, { forCreate: true });
    await this.assertCodeAvailable(data.code);
    await this.assertLocationHierarchy(
      data.type as OperationalLocationType,
      data.parentId,
    );
    this.assertCoordinates(data.latitude, data.longitude);

    const location = (await this.prisma.operationalLocation
      .create({
        data: {
          name: data.name as string,
          code: data.code ?? null,
          type: data.type as OperationalLocationType,
          parentId: data.parentId ?? null,
          address: data.address ?? null,
          latitude: this.toPrismaCoordinate(data.latitude),
          longitude: this.toPrismaCoordinate(data.longitude),
          isActive: true,
        },
      })
      .catch((error: unknown) => {
        this.throwDuplicateCodeConflict(error);
        throw error;
      })) as LocationRecord;

    return this.toLocationResponse(location);
  }

  async update(id: string, dto: UpdateLocationDto): Promise<LocationResponse> {
    const data = this.normalizeMutationData(dto);

    return this.prisma
      .$transaction(
        async (tx) => {
          const currentLocation = await this.findLocationForMutation(id, tx);

          if (data.code !== undefined) {
            await this.assertCodeAvailable(data.code, currentLocation.id, tx);
          }

          if (
            data.parentId !== undefined ||
            data.type !== undefined ||
            data.isActive !== undefined
          ) {
            await this.assertLocationHierarchy(
              data.type ?? currentLocation.type,
              data.parentId !== undefined
                ? data.parentId
                : currentLocation.parentId,
              currentLocation.id,
              currentLocation.type,
              tx,
              data.parentId !== undefined || data.type !== undefined,
            );
          }

          this.assertCoordinates(
            data.latitude !== undefined
              ? data.latitude
              : currentLocation.latitude,
            data.longitude !== undefined
              ? data.longitude
              : currentLocation.longitude,
          );

          if (data.isActive === false && currentLocation.isActive) {
            await this.assertNoOpenDependencies(currentLocation, tx);
          }

          const location = (await tx.operationalLocation.update({
            where: { id: currentLocation.id },
            data: this.toPrismaMutationData(data),
          })) as LocationRecord;

          return this.toLocationResponse(location);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        this.throwDuplicateCodeConflict(error);
        throw error;
      });
  }

  async deactivate(id: string): Promise<LocationResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const currentLocation = await this.findActiveLocationForMutation(
          id,
          tx,
        );
        await this.assertNoOpenDependencies(currentLocation, tx);

        const location = (await tx.operationalLocation.update({
          where: { id: currentLocation.id },
          data: { isActive: false },
        })) as LocationRecord;

        return this.toLocationResponse(location);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async assertLocationCanBeUsedForSale(locationId: string): Promise<void> {
    await this.assertActiveLocation(locationId, 'New sales');
  }

  async assertLocationCanBeUsedForPurchase(locationId: string): Promise<void> {
    await this.assertActiveLocation(locationId, 'New purchases');
  }

  async assertLocationCanBeUsedForAdjustment(
    locationId: string,
  ): Promise<void> {
    await this.assertActiveLocation(locationId, 'New inventory adjustments');
  }

  async assertLocationsCanBeUsedForTransfer(
    originLocationId: string,
    destinationLocationId: string,
  ): Promise<void> {
    await this.assertActiveLocation(originLocationId, 'New transfers');
    await this.assertActiveLocation(destinationLocationId, 'New transfers');
  }

  private buildListWhere(
    query: ListLocationsQueryDto,
    currentUser: LocationListActor,
  ): Prisma.OperationalLocationWhereInput {
    const search = query.search?.trim();
    const scope = this.buildScopeWhere(currentUser);
    const searchFilter: Prisma.OperationalLocationWhereInput | undefined =
      search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined;

    return {
      isActive: query.isActive ?? true,
      ...(query.type ? { type: query.type } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(searchFilter && Object.keys(scope).length > 0
        ? { AND: [scope, searchFilter] }
        : (searchFilter ?? scope)),
    };
  }

  private buildPagination(query: ListLocationsQueryDto): {
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

  private buildScopeWhere(
    currentUser: LocationListActor,
  ): Prisma.OperationalLocationWhereInput {
    if (currentUser.role === 'ADMIN') return {};

    if (currentUser.role === 'WAREHOUSE') {
      const locationId = currentUser.operationalLocationId;
      return {
        OR: locationId
          ? [
              { id: locationId },
              {
                parentId: locationId,
                type: 'BRANCH',
                isActive: true,
              },
            ]
          : [{ id: SELLER_WITHOUT_LOCATION }],
      };
    }

    return { id: currentUser.operationalLocationId ?? SELLER_WITHOUT_LOCATION };
  }

  private assertLocationReadScope(
    location: LocationRecord,
    currentUser: LocationListActor,
  ): void {
    if (currentUser.role === 'ADMIN') return;

    if (
      currentUser.role === 'WAREHOUSE' &&
      (location.id === currentUser.operationalLocationId ||
        (location.type === 'BRANCH' &&
          location.parentId === currentUser.operationalLocationId &&
          location.isActive))
    ) {
      return;
    }

    if (location.id === currentUser.operationalLocationId) return;

    throw new NotFoundException('Location not found');
  }

  private async findLocationForMutation(
    id: string,
    client: LocationClient = this.prisma,
  ): Promise<LocationRecord> {
    const location = (await client.operationalLocation.findUnique({
      where: { id },
    })) as LocationRecord | null;

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }

  private async findActiveLocationForMutation(
    id: string,
    client: LocationClient = this.prisma,
  ): Promise<LocationRecord> {
    const location = (await client.operationalLocation.findFirst({
      where: { id, isActive: true },
    })) as LocationRecord | null;

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }

  private async assertActiveLocation(
    locationId: string,
    operationLabel: string,
  ): Promise<void> {
    const location = await this.prisma.operationalLocation.findUnique({
      where: { id: locationId },
      select: { id: true, isActive: true },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    if (!location.isActive) {
      throw new BadRequestException(
        `${operationLabel} require an active location`,
      );
    }
  }

  private async assertNoOpenDependencies(
    location: LocationRecord,
    client: LocationClient = this.prisma,
  ): Promise<void> {
    const locationIds = [location.id];
    const children =
      (await client.operationalLocation.findMany({
        where: {
          parentId: location.id,
        },
        select: { id: true, isActive: true },
      })) ?? [];

    if (location.type === 'DISTRIBUTION_CENTER' && children.length > 0) {
      throw new BadRequestException(
        'Cannot deactivate a CEDIS with child locations',
      );
    }

    if (children.length > 0) {
      throw new BadRequestException(
        'Cannot deactivate a location with child locations',
      );
    }

    const transfer = await client.inventoryTransfer.findFirst({
      where: {
        status: InventoryTransferStatus.IN_TRANSIT,
        OR: [
          { originLocationId: { in: locationIds } },
          { destinationLocationId: { in: locationIds } },
        ],
      },
      select: { id: true },
    });

    if (transfer) {
      throw new BadRequestException(
        'Cannot deactivate a location with transfers in transit',
      );
    }

    const dailyClose = await client.pointOfSaleDailyClose.findFirst({
      where: {
        operationalLocationId: { in: locationIds },
        status: {
          in: [
            PointOfSaleDailyCloseStatus.DRAFT,
            PointOfSaleDailyCloseStatus.REVIEWED,
          ],
        },
      },
      select: { id: true },
    });

    if (dailyClose) {
      throw new BadRequestException(
        'Cannot deactivate a location with open daily closes',
      );
    }

    const activeRoute = await client.deliveryRoute.findFirst({
      where: {
        OR: [
          {
            originLocationId: { in: locationIds },
            status: {
              in: [
                DeliveryRouteStatus.PENDING,
                DeliveryRouteStatus.IN_PROGRESS,
              ],
            },
          },
          {
            routeStockLocationId: { in: locationIds },
            status: {
              in: [
                DeliveryRouteStatus.PENDING,
                DeliveryRouteStatus.IN_PROGRESS,
              ],
            },
          },
          {
            originLocationId: { in: locationIds },
            settlement: {
              status: {
                in: [
                  RouteSettlementStatus.OPEN,
                  RouteSettlementStatus.REVIEW_REQUIRED,
                ],
              },
            },
          },
          {
            routeStockLocationId: { in: locationIds },
            settlement: {
              status: {
                in: [
                  RouteSettlementStatus.OPEN,
                  RouteSettlementStatus.REVIEW_REQUIRED,
                ],
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (activeRoute) {
      throw new BadRequestException(
        'Cannot deactivate a location with active routes or open settlements',
      );
    }

    const cycle = await client.branchSupplyCycle.findFirst({
      where: {
        status: {
          notIn: [
            BranchSupplyCycleStatus.CLOSED,
            BranchSupplyCycleStatus.CANCELLED,
          ],
        },
        OR: [
          { distributionCenterLocationId: { in: locationIds } },
          { branchLocationId: { in: locationIds } },
        ],
      },
      select: { id: true },
    });

    if (cycle) {
      throw new BadRequestException(
        'Cannot deactivate a location with open CEDIS supply cycles',
      );
    }
  }

  private async assertCodeAvailable(
    code: string | null | undefined,
    currentLocationId?: string,
    client: LocationClient = this.prisma,
  ): Promise<void> {
    if (code === undefined || code === null) {
      return;
    }

    const existingLocation = await client.operationalLocation.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existingLocation && existingLocation.id !== currentLocationId) {
      throw new ConflictException('Location code is already registered');
    }
  }

  private async assertLocationHierarchy(
    type: OperationalLocationType,
    parentId: string | null | undefined,
    currentLocationId?: string,
    currentType?: OperationalLocationType,
    client: LocationClient = this.prisma,
    checkOpenCycle = false,
  ): Promise<void> {
    if (
      currentLocationId &&
      currentType === 'DISTRIBUTION_CENTER' &&
      type !== 'DISTRIBUTION_CENTER'
    ) {
      const activeChild = await client.operationalLocation.findFirst({
        where: { parentId: currentLocationId, isActive: true },
        select: { id: true },
      });

      if (activeChild) {
        throw new BadRequestException(
          'Cannot change a CEDIS type while it has active child locations',
        );
      }
    }

    if (checkOpenCycle && currentLocationId && currentType === 'BRANCH') {
      const openCycle = await client.branchSupplyCycle.findFirst({
        where: {
          branchLocationId: currentLocationId,
          status: {
            notIn: [
              BranchSupplyCycleStatus.CLOSED,
              BranchSupplyCycleStatus.CANCELLED,
            ],
          },
        },
        select: { id: true },
      });

      if (openCycle) {
        throw new BadRequestException(
          'Cannot change a branch hierarchy while it has an open CEDIS supply cycle',
        );
      }
    }

    if (
      type === 'DISTRIBUTION_CENTER' &&
      parentId !== null &&
      parentId !== undefined
    ) {
      throw new BadRequestException(
        'DISTRIBUTION_CENTER locations cannot have a parent',
      );
    }

    if (type === 'BRANCH' && (parentId === undefined || parentId === null)) {
      throw new BadRequestException(
        'BRANCH locations must have a DISTRIBUTION_CENTER parent',
      );
    }

    if (parentId === undefined || parentId === null) {
      return;
    }

    if (parentId === currentLocationId) {
      throw new BadRequestException('Location cannot be its own parent');
    }

    const parentLocation = await client.operationalLocation.findUnique({
      where: { id: parentId },
      select: { id: true, type: true, isActive: true, parentId: true },
    });

    if (!parentLocation) {
      throw new BadRequestException('Parent location does not exist');
    }

    if (!parentLocation.isActive) {
      throw new BadRequestException('Parent location must be active');
    }

    if (type === 'BRANCH' && parentLocation.type !== 'DISTRIBUTION_CENTER') {
      throw new BadRequestException(
        'BRANCH locations must have a DISTRIBUTION_CENTER parent',
      );
    }

    const visited = new Set<string>();
    let ancestor: typeof parentLocation | null = parentLocation;
    while (ancestor) {
      if (ancestor.id === currentLocationId) {
        throw new BadRequestException('Location parent would create a cycle');
      }
      if (visited.has(ancestor.id)) {
        throw new BadRequestException(
          'Location parent hierarchy contains a cycle',
        );
      }
      visited.add(ancestor.id);
      if (!ancestor.parentId) break;
      ancestor = await client.operationalLocation.findUnique({
        where: { id: ancestor.parentId },
        select: { id: true, type: true, isActive: true, parentId: true },
      });
    }
  }

  private normalizeMutationData(
    dto: LocationMutationDto,
    options: { forCreate?: boolean } = {},
  ): Partial<LocationMutationData> {
    const name = dto.name !== undefined ? dto.name.trim() : undefined;

    if (name !== undefined && name.length === 0) {
      throw new BadRequestException('name is required');
    }

    if (options.forCreate && name === undefined) {
      throw new BadRequestException('name is required');
    }

    return {
      ...(name !== undefined ? { name } : {}),
      ...(dto.code !== undefined
        ? { code: this.normalizeOptionalText(dto.code) }
        : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.parentId !== undefined
        ? { parentId: this.normalizeOptionalText(dto.parentId) }
        : options.forCreate
          ? { parentId: null }
          : {}),
      ...(dto.address !== undefined
        ? { address: this.normalizeOptionalText(dto.address) }
        : {}),
      ...(dto.latitude !== undefined
        ? { latitude: dto.latitude }
        : options.forCreate
          ? { latitude: null }
          : {}),
      ...(dto.longitude !== undefined
        ? { longitude: dto.longitude }
        : options.forCreate
          ? { longitude: null }
          : {}),
      ...('isActive' in dto && dto.isActive !== undefined
        ? { isActive: dto.isActive }
        : {}),
    };
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private assertCoordinates(
    latitude: LocationRecord['latitude'] | undefined,
    longitude: LocationRecord['longitude'] | undefined,
  ): void {
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'latitude and longitude must be provided together',
      );
    }

    if (!hasLatitude || !hasLongitude) return;

    const numericLatitude = Number(latitude);
    const numericLongitude = Number(longitude);
    if (
      !Number.isFinite(numericLatitude) ||
      numericLatitude < -90 ||
      numericLatitude > 90 ||
      !Number.isFinite(numericLongitude) ||
      numericLongitude < -180 ||
      numericLongitude > 180
    ) {
      throw new BadRequestException('Coordinates are out of range');
    }
  }

  private toPrismaMutationData(
    data: Partial<LocationMutationData>,
  ): Prisma.OperationalLocationUncheckedUpdateInput {
    return {
      ...data,
      ...(data.latitude !== undefined
        ? { latitude: this.toPrismaCoordinate(data.latitude) }
        : {}),
      ...(data.longitude !== undefined
        ? { longitude: this.toPrismaCoordinate(data.longitude) }
        : {}),
    } as Prisma.OperationalLocationUncheckedUpdateInput;
  }

  private toPrismaCoordinate(
    value: LocationRecord['latitude'] | undefined,
  ): number | null {
    return value == null ? null : Number(value.toString());
  }

  private toLocationResponse(location: LocationRecord): LocationResponse {
    return {
      id: location.id,
      name: location.name,
      code: location.code,
      type: location.type,
      parentId: location.parentId,
      address: location.address,
      latitude:
        location.latitude == null ? null : Number(location.latitude.toString()),
      longitude:
        location.longitude == null
          ? null
          : Number(location.longitude.toString()),
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }

  private throwDuplicateCodeConflict(error: unknown): void {
    if (this.isUniqueConstraintError(error)) {
      throw new ConflictException('Location code is already registered');
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
