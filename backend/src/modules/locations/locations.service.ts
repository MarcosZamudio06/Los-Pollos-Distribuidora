import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OperationalLocationType, Prisma } from '@prisma/client';
import {
  DeliveryRouteStatus,
  InventoryTransferStatus,
  PointOfSaleDailyCloseStatus,
  RouteSettlementStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
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

type LocationResponse = Omit<LocationRecord, 'latitude' | 'longitude'> & { latitude: number | null; longitude: number | null };

type LocationListResponse = { items: LocationResponse[] };

type LocationMutationDto = CreateLocationDto | UpdateLocationDto;
type LocationMutationData = Pick<LocationRecord, 'name' | 'code' | 'type' | 'parentId' | 'address' | 'isActive'>;

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListLocationsQueryDto = {},
  ): Promise<LocationListResponse> {
    const locations = (await this.prisma.operationalLocation.findMany({
      where: this.buildListWhere(query),
      orderBy: { name: 'asc' },
      ...this.buildPagination(query),
    })) as LocationRecord[];

    return {
      items: locations.map((location) => this.toLocationResponse(location)),
    };
  }

  async findOne(id: string): Promise<LocationResponse> {
    const location = (await this.prisma.operationalLocation.findUnique({
      where: { id },
    })) as LocationRecord | null;

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return this.toLocationResponse(location);
  }

  async create(dto: CreateLocationDto): Promise<LocationResponse> {
    const data = this.normalizeMutationData(dto, { forCreate: true });
    await this.assertCodeAvailable(data.code);
    await this.assertParentLocationExists(data.parentId);

    const location = (await this.prisma.operationalLocation
      .create({
        data: {
          name: data.name as string,
          code: data.code ?? null,
          type: data.type as OperationalLocationType,
          parentId: data.parentId ?? null,
          address: data.address ?? null,
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
    const currentLocation = await this.findLocationForMutation(id);
    const data = this.normalizeMutationData(dto);

    if (data.code !== undefined) {
      await this.assertCodeAvailable(data.code, currentLocation.id);
    }

    if (data.parentId !== undefined) {
      await this.assertParentLocationExists(data.parentId, currentLocation.id);
    }

    if (data.isActive === false && currentLocation.isActive) {
      await this.assertNoOpenDependencies(currentLocation.id);
    }

    const location = (await this.prisma.operationalLocation
      .update({
        where: { id: currentLocation.id },
        data: data as Prisma.OperationalLocationUncheckedUpdateInput,
      })
      .catch((error: unknown) => {
        this.throwDuplicateCodeConflict(error);
        throw error;
      })) as LocationRecord;

    return this.toLocationResponse(location);
  }

  async deactivate(id: string): Promise<LocationResponse> {
    const currentLocation = await this.findActiveLocationForMutation(id);
    await this.assertNoOpenDependencies(currentLocation.id);

    const location = (await this.prisma.operationalLocation.update({
      where: { id: currentLocation.id },
      data: { isActive: false },
    })) as LocationRecord;

    return this.toLocationResponse(location);
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
  ): Prisma.OperationalLocationWhereInput {
    const search = query.search?.trim();

    return {
      isActive: query.isActive ?? true,
      ...(query.type ? { type: query.type } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
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

  private async findLocationForMutation(id: string): Promise<LocationRecord> {
    const location = (await this.prisma.operationalLocation.findUnique({
      where: { id },
    })) as LocationRecord | null;

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }

  private async findActiveLocationForMutation(
    id: string,
  ): Promise<LocationRecord> {
    const location = (await this.prisma.operationalLocation.findFirst({
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

  private async assertNoOpenDependencies(locationId: string): Promise<void> {
    const transfer = await this.prisma.inventoryTransfer.findFirst({
      where: {
        status: InventoryTransferStatus.IN_TRANSIT,
        OR: [
          { originLocationId: locationId },
          { destinationLocationId: locationId },
        ],
      },
      select: { id: true },
    });

    if (transfer) {
      throw new BadRequestException(
        'Cannot deactivate a location with transfers in transit',
      );
    }

    const dailyClose = await this.prisma.pointOfSaleDailyClose.findFirst({
      where: {
        operationalLocationId: locationId,
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

    const activeRoute = await this.prisma.deliveryRoute.findFirst({
      where: {
        OR: [
          {
            originLocationId: locationId,
            status: {
              in: [
                DeliveryRouteStatus.PENDING,
                DeliveryRouteStatus.IN_PROGRESS,
              ],
            },
          },
          {
            routeStockLocationId: locationId,
            status: {
              in: [
                DeliveryRouteStatus.PENDING,
                DeliveryRouteStatus.IN_PROGRESS,
              ],
            },
          },
          {
            originLocationId: locationId,
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
            routeStockLocationId: locationId,
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
  }

  private async assertCodeAvailable(
    code: string | null | undefined,
    currentLocationId?: string,
  ): Promise<void> {
    if (code === undefined || code === null) {
      return;
    }

    const existingLocation = await this.prisma.operationalLocation.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existingLocation && existingLocation.id !== currentLocationId) {
      throw new ConflictException('Location code is already registered');
    }
  }

  private async assertParentLocationExists(
    parentId: string | null | undefined,
    currentLocationId?: string,
  ): Promise<void> {
    if (parentId === undefined || parentId === null) {
      return;
    }

    if (parentId === currentLocationId) {
      throw new BadRequestException('Location cannot be its own parent');
    }

    const parentLocation = await this.prisma.operationalLocation.findUnique({
      where: { id: parentId },
      select: { id: true },
    });

    if (!parentLocation) {
      throw new BadRequestException('Parent location does not exist');
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

  private toLocationResponse(location: LocationRecord): LocationResponse {
    return {
      id: location.id,
      name: location.name,
      code: location.code,
      type: location.type,
      parentId: location.parentId,
      address: location.address,
      latitude: location.latitude == null ? null : Number(location.latitude.toString()),
      longitude: location.longitude == null ? null : Number(location.longitude.toString()),
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
