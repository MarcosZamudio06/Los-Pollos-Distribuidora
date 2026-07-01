import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateOperationalConfigDto, ListOperationalConfigQueryDto, UpdateOperationalConfigDto } from './dto';

type OperationalConfigRecord = Prisma.OperationalConfigGetPayload<Record<string, never>>;
type ConfigMutationDto = CreateOperationalConfigDto | UpdateOperationalConfigDto;

const STRUCTURAL_INVARIANT_KEYS = new Set([
  'ENABLE_GLOBAL_STOCK',
  'DISABLE_LOCATION_INVENTORY',
  'DISABLE_LOCATION_ID_ON_SALES',
  'DISABLE_ACCOUNTS_RECEIVABLE_FOR_CREDIT',
  'DISABLE_INVENTORY_TRANSFERS',
  'DISABLE_TRANSFER_DOMAIN',
  'USE_INTERNAL_TICKET_AS_ONLY_MVP_DOCUMENT',
]);

const ALLOWED_KEYS = new Set([
  'REPORT_REFRESH_INTERVAL_SECONDS',
  'DEFAULT_SALE_STOCK_LOCATION_STRATEGY',
  'ROUNDING_MODE',
  'SHRINKAGE_TOLERANCE',
  'REQUIRED_DELIVERY_EVIDENCE',
]);

const SAFE_STOCK_LOCATION_STRATEGIES = new Set(['REQUIRE_EXPLICIT_LOCATION', 'USER_SELECTED_LOCATION', 'CUSTOMER_ROUTE_LOCATION']);

@Injectable()
export class OperationalConfigService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ListOperationalConfigQueryDto = {}) {
    const configs = (await this.prisma.operationalConfig.findMany({
      where: this.buildListWhere(query),
      orderBy: { key: 'asc' },
      ...this.buildPagination(query),
    })) as OperationalConfigRecord[];

    return { items: configs.map((config) => this.toResponse(config)) };
  }

  async create(dto: CreateOperationalConfigDto, currentUser: AuthenticatedUser) {
    const data = await this.normalizeMutationData(dto, currentUser.id, true) as Prisma.OperationalConfigUncheckedCreateInput;
    const config = (await this.prisma.operationalConfig.create({ data })) as OperationalConfigRecord;
    return this.toResponse(config);
  }

  async update(id: string, dto: UpdateOperationalConfigDto, currentUser: AuthenticatedUser) {
    const current = await this.findActiveConfig(id);
    const merged = { ...this.toMutationSnapshot(current), ...dto };
    await this.validateConfig(merged);

    const data = await this.normalizeMutationData(dto, currentUser.id, false) as Prisma.OperationalConfigUncheckedUpdateInput;
    const config = (await this.prisma.operationalConfig.update({ where: { id }, data })) as OperationalConfigRecord;
    return this.toResponse(config);
  }

  async deactivate(id: string, currentUser: AuthenticatedUser) {
    await this.findActiveConfig(id);
    const config = (await this.prisma.operationalConfig.update({
      where: { id },
      data: { isActive: false, updatedByUserId: currentUser.id },
    })) as OperationalConfigRecord;
    return this.toResponse(config);
  }

  private buildListWhere(query: ListOperationalConfigQueryDto): Prisma.OperationalConfigWhereInput {
    return {
      ...(query.key ? { key: query.key } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
  }

  private buildPagination(query: ListOperationalConfigQueryDto): { skip?: number; take?: number } {
    if (!query.limit) return {};
    return { skip: ((query.page ?? 1) - 1) * query.limit, take: query.limit };
  }

  private async normalizeMutationData(dto: ConfigMutationDto, userId: string, isCreate: boolean) {
    await this.validateConfig(dto);
    if (dto.scope?.trim() === 'LOCATION' && dto.locationId) await this.assertActiveLocation(dto.locationId);

    return {
      ...(dto.key !== undefined ? { key: dto.key.trim() } : {}),
      ...(dto.value !== undefined ? { value: dto.value.trim() } : {}),
      ...(dto.valueType !== undefined ? { valueType: dto.valueType.trim() } : {}),
      ...(dto.scope !== undefined ? { scope: dto.scope.trim() } : {}),
      ...(dto.locationId !== undefined ? { locationId: dto.locationId?.trim() || null } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.effectiveFrom !== undefined ? { effectiveFrom: this.parseDate(dto.effectiveFrom, 'effectiveFrom') } : {}),
      ...(dto.effectiveTo !== undefined ? { effectiveTo: dto.effectiveTo ? this.parseDate(dto.effectiveTo, 'effectiveTo') : null } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : isCreate ? { isActive: true } : {}),
      ...(isCreate ? { createdByUserId: userId } : {}),
      updatedByUserId: userId,
    };
  }

  private async validateConfig(dto: Partial<ConfigMutationDto>): Promise<void> {
    const key = dto.key?.trim();
    const value = dto.value?.trim();
    const valueType = dto.valueType?.trim();
    const scope = dto.scope?.trim();

    if (key !== undefined && key.length === 0) throw new BadRequestException('key is required');
    if (value !== undefined && value.length === 0) throw new BadRequestException('value is required');
    if (valueType !== undefined && valueType.length === 0) throw new BadRequestException('valueType is required');
    if (scope !== undefined && scope.length === 0) throw new BadRequestException('scope is required');
    if ('effectiveFrom' in dto && !dto.effectiveFrom) throw new BadRequestException('effectiveFrom is required');
    if (scope === 'LOCATION' && !dto.locationId) throw new BadRequestException('locationId is required for LOCATION scope');

    const effectiveFrom = dto.effectiveFrom ? this.parseDate(dto.effectiveFrom, 'effectiveFrom') : undefined;
    const effectiveTo = dto.effectiveTo ? this.parseDate(dto.effectiveTo, 'effectiveTo') : undefined;
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo must be greater than or equal to effectiveFrom');
    }

    if (!key) return;
    if (key === 'DRIVER_OFFLINE_POLICY') throw new BadRequestException('DRIVER_OFFLINE_POLICY is blocked until business approval');
    if (STRUCTURAL_INVARIANT_KEYS.has(key)) throw new BadRequestException('Operational config cannot modify structural MVP invariants');
    if (!ALLOWED_KEYS.has(key)) throw new BadRequestException('Operational config key is not allowed for MVP');

    if (key === 'REPORT_REFRESH_INTERVAL_SECONDS' && value !== undefined) {
      const numericValue = Number(value);
      if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 60) {
        throw new BadRequestException('REPORT_REFRESH_INTERVAL_SECONDS must be an integer between 1 and 60');
      }
    }

    if (key === 'DEFAULT_SALE_STOCK_LOCATION_STRATEGY' && value !== undefined && !SAFE_STOCK_LOCATION_STRATEGIES.has(value)) {
      throw new BadRequestException('DEFAULT_SALE_STOCK_LOCATION_STRATEGY must preserve sale locationId');
    }
  }

  private async assertActiveLocation(locationId: string): Promise<void> {
    const location = await this.prisma.operationalLocation.findFirst({ where: { id: locationId, isActive: true }, select: { id: true } });
    if (!location) throw new BadRequestException('LOCATION scope requires an active location');
  }

  private async findActiveConfig(id: string): Promise<OperationalConfigRecord> {
    const config = (await this.prisma.operationalConfig.findFirst({ where: { id, isActive: true } })) as OperationalConfigRecord | null;
    if (!config) throw new NotFoundException('Operational config not found');
    return config;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private toMutationSnapshot(config: OperationalConfigRecord): CreateOperationalConfigDto {
    return {
      key: config.key,
      value: config.value,
      valueType: config.valueType,
      scope: config.scope,
      locationId: config.locationId,
      description: config.description ?? undefined,
      effectiveFrom: config.effectiveFrom?.toISOString() ?? '',
      effectiveTo: config.effectiveTo?.toISOString() ?? null,
      isActive: config.isActive,
    };
  }

  private toResponse(config: OperationalConfigRecord) {
    return {
      id: config.id,
      key: config.key,
      value: config.value,
      valueType: config.valueType,
      scope: config.scope,
      locationId: config.locationId,
      description: config.description,
      effectiveFrom: config.effectiveFrom,
      effectiveTo: config.effectiveTo,
      isActive: config.isActive,
      createdByUserId: config.createdByUserId,
      updatedByUserId: config.updatedByUserId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
