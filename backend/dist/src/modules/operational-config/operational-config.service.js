"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationalConfigService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
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
let OperationalConfigService = class OperationalConfigService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query = {}) {
        const configs = (await this.prisma.operationalConfig.findMany({
            where: this.buildListWhere(query),
            orderBy: { key: 'asc' },
            ...this.buildPagination(query),
        }));
        return { items: configs.map((config) => this.toResponse(config)) };
    }
    async create(dto, currentUser) {
        const data = await this.normalizeMutationData(dto, currentUser.id, true);
        const config = (await this.prisma.operationalConfig.create({ data }));
        return this.toResponse(config);
    }
    async update(id, dto, currentUser) {
        const current = await this.findActiveConfig(id);
        const merged = { ...this.toMutationSnapshot(current), ...dto };
        await this.validateConfig(merged);
        const data = await this.normalizeMutationData(dto, currentUser.id, false);
        const config = (await this.prisma.operationalConfig.update({ where: { id }, data }));
        return this.toResponse(config);
    }
    async deactivate(id, currentUser) {
        await this.findActiveConfig(id);
        const config = (await this.prisma.operationalConfig.update({
            where: { id },
            data: { isActive: false, updatedByUserId: currentUser.id },
        }));
        return this.toResponse(config);
    }
    buildListWhere(query) {
        return {
            ...(query.key ? { key: query.key } : {}),
            ...(query.scope ? { scope: query.scope } : {}),
            ...(query.locationId ? { locationId: query.locationId } : {}),
            ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        };
    }
    buildPagination(query) {
        if (!query.limit)
            return {};
        return { skip: ((query.page ?? 1) - 1) * query.limit, take: query.limit };
    }
    async normalizeMutationData(dto, userId, isCreate) {
        await this.validateConfig(dto);
        if (dto.scope?.trim() === 'LOCATION' && dto.locationId)
            await this.assertActiveLocation(dto.locationId);
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
    async validateConfig(dto) {
        const key = dto.key?.trim();
        const value = dto.value?.trim();
        const valueType = dto.valueType?.trim();
        const scope = dto.scope?.trim();
        if (key !== undefined && key.length === 0)
            throw new common_1.BadRequestException('key is required');
        if (value !== undefined && value.length === 0)
            throw new common_1.BadRequestException('value is required');
        if (valueType !== undefined && valueType.length === 0)
            throw new common_1.BadRequestException('valueType is required');
        if (scope !== undefined && scope.length === 0)
            throw new common_1.BadRequestException('scope is required');
        if ('effectiveFrom' in dto && !dto.effectiveFrom)
            throw new common_1.BadRequestException('effectiveFrom is required');
        if (scope === 'LOCATION' && !dto.locationId)
            throw new common_1.BadRequestException('locationId is required for LOCATION scope');
        const effectiveFrom = dto.effectiveFrom ? this.parseDate(dto.effectiveFrom, 'effectiveFrom') : undefined;
        const effectiveTo = dto.effectiveTo ? this.parseDate(dto.effectiveTo, 'effectiveTo') : undefined;
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
            throw new common_1.BadRequestException('effectiveTo must be greater than or equal to effectiveFrom');
        }
        if (!key)
            return;
        if (key === 'DRIVER_OFFLINE_POLICY')
            throw new common_1.BadRequestException('DRIVER_OFFLINE_POLICY is blocked until business approval');
        if (STRUCTURAL_INVARIANT_KEYS.has(key))
            throw new common_1.BadRequestException('Operational config cannot modify structural MVP invariants');
        if (!ALLOWED_KEYS.has(key))
            throw new common_1.BadRequestException('Operational config key is not allowed for MVP');
        if (key === 'REPORT_REFRESH_INTERVAL_SECONDS' && value !== undefined) {
            const numericValue = Number(value);
            if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 60) {
                throw new common_1.BadRequestException('REPORT_REFRESH_INTERVAL_SECONDS must be an integer between 1 and 60');
            }
        }
        if (key === 'DEFAULT_SALE_STOCK_LOCATION_STRATEGY' && value !== undefined && !SAFE_STOCK_LOCATION_STRATEGIES.has(value)) {
            throw new common_1.BadRequestException('DEFAULT_SALE_STOCK_LOCATION_STRATEGY must preserve sale locationId');
        }
    }
    async assertActiveLocation(locationId) {
        const location = await this.prisma.operationalLocation.findFirst({ where: { id: locationId, isActive: true }, select: { id: true } });
        if (!location)
            throw new common_1.BadRequestException('LOCATION scope requires an active location');
    }
    async findActiveConfig(id) {
        const config = (await this.prisma.operationalConfig.findFirst({ where: { id, isActive: true } }));
        if (!config)
            throw new common_1.NotFoundException('Operational config not found');
        return config;
    }
    parseDate(value, field) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            throw new common_1.BadRequestException(`${field} must be a valid date`);
        return date;
    }
    toMutationSnapshot(config) {
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
    toResponse(config) {
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
};
exports.OperationalConfigService = OperationalConfigService;
exports.OperationalConfigService = OperationalConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OperationalConfigService);
//# sourceMappingURL=operational-config.service.js.map