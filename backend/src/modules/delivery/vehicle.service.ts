import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeliveryRouteStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateVehicleDto,
  ListVehiclesQueryDto,
  UpdateVehicleDto,
} from './dto';

type VehicleRecord = {
  id: string;
  code: string;
  displayName: string;
  plateNumber: string | null;
  homeLocationId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class VehicleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListVehiclesQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      items: items.map((vehicle) => this.toResponse(vehicle)),
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }

  async create(dto: CreateVehicleDto) {
    const code = this.normalizeRequired(dto.code, 'code');
    const displayName = this.normalizeRequired(dto.displayName, 'displayName');
    const plateNumber = this.normalizeOptional(dto.plateNumber);
    const homeLocationId = this.normalizeOptional(dto.homeLocationId);

    await this.assertHomeLocation(homeLocationId);

    const vehicle = await this.prisma.vehicle
      .create({
        data: {
          code,
          displayName,
          plateNumber,
          homeLocationId,
          isActive: true,
        },
      })
      .catch((error: unknown) => {
        this.throwUniqueConstraintConflict(error);
        throw error;
      });

    return this.toResponse(vehicle);
  }

  async update(id: string, dto: UpdateVehicleDto) {
    return this.prisma
      .$transaction(async (tx) => {
        const current = await tx.vehicle.findUnique({
          where: { id },
        });
        if (!current) throw new NotFoundException('Vehicle not found');

        const code =
          dto.code === undefined
            ? undefined
            : this.normalizeRequired(dto.code, 'code');
        const displayName =
          dto.displayName === undefined
            ? undefined
            : this.normalizeRequired(dto.displayName, 'displayName');
        const plateNumber =
          dto.plateNumber === undefined
            ? undefined
            : this.normalizeOptional(dto.plateNumber);
        const homeLocationId =
          dto.homeLocationId === undefined
            ? undefined
            : this.normalizeOptional(dto.homeLocationId);

        if (homeLocationId !== undefined) {
          await this.assertHomeLocation(homeLocationId, tx);
        }

        if (dto.isActive === false && current.isActive) {
          const activeRoute = await tx.deliveryRoute.findFirst({
            where: {
              vehicleId: id,
              status: DeliveryRouteStatus.IN_PROGRESS,
            },
            select: { id: true },
          });
          if (activeRoute) {
            throw new ConflictException(
              'An active vehicle cannot be deactivated while it has an in-progress route',
            );
          }
        }

        const vehicle = await tx.vehicle.update({
          where: { id },
          data: {
            ...(code !== undefined ? { code } : {}),
            ...(displayName !== undefined ? { displayName } : {}),
            ...(plateNumber !== undefined ? { plateNumber } : {}),
            ...(homeLocationId !== undefined ? { homeLocationId } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });

        return this.toResponse(vehicle);
      })
      .catch((error: unknown) => {
        this.throwUniqueConstraintConflict(error);
        throw error;
      });
  }

  private buildWhere(
    query: ListVehiclesQueryDto,
  ): Prisma.VehicleWhereInput {
    const active = query.active ?? query.isActive;
    const search = query.search?.trim();
    return {
      ...(active === undefined ? {} : { isActive: active }),
      ...(query.homeLocationId
        ? { homeLocationId: query.homeLocationId.trim() }
        : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
              { plateNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async assertHomeLocation(
    homeLocationId: string | null | undefined,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    if (!homeLocationId) return;
    const location = await client.operationalLocation.findFirst({
      where: { id: homeLocationId, isActive: true },
      select: { id: true },
    });
    if (!location) {
      throw new UnprocessableEntityException(
        'The selected home location is not active or does not exist',
      );
    }
  }

  private normalizeRequired(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new UnprocessableEntityException(`${field} cannot be empty`);
    }
    return normalized;
  }

  private normalizeOptional(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private toResponse(vehicle: VehicleRecord) {
    return {
      id: vehicle.id,
      code: vehicle.code,
      displayName: vehicle.displayName,
      plateNumber: vehicle.plateNumber,
      homeLocationId: vehicle.homeLocationId,
      isActive: vehicle.isActive,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
  }

  private throwUniqueConstraintConflict(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const rawTarget = error.meta?.target;
      const target =
        typeof rawTarget === 'string'
          ? rawTarget
          : Array.isArray(rawTarget) &&
              rawTarget.every(
                (value): value is string => typeof value === 'string',
              )
            ? rawTarget.join(', ')
            : 'field';
      throw new ConflictException(`Vehicle ${target} is already in use`);
    }
  }
}
