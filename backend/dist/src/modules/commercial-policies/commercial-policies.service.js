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
exports.CommercialPoliciesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const HISTORICAL_POLICY_FIELDS = [
    'customerType',
    'priceListId',
    'defaultCreditLimit',
    'defaultCreditDays',
    'overdueBlockingMode',
    'creditLimitBlockingMode',
    'allowAdministrativeOverride',
    'effectiveFrom',
];
let CommercialPoliciesService = class CommercialPoliciesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query = {}) {
        const policies = (await this.prisma.commercialPolicy.findMany({
            where: this.buildListWhere(query),
            orderBy: { name: 'asc' },
            ...this.buildPagination(query),
        }));
        return { items: policies.map((policy) => this.toResponse(policy)) };
    }
    async create(dto, currentUser) {
        const data = this.normalizeMutationData(dto, currentUser.id, true);
        const policy = (await this.prisma.commercialPolicy.create({ data }));
        return this.toResponse(policy);
    }
    async update(id, dto, currentUser) {
        const current = await this.findActivePolicy(id);
        await this.assertHistoricalConditionsAreNotOverwritten(id, dto);
        const merged = { ...this.toMutationSnapshot(current), ...dto };
        const data = this.normalizeMutationData(merged, currentUser.id, false);
        const policy = (await this.prisma.commercialPolicy.update({ where: { id }, data }));
        return this.toResponse(policy);
    }
    async deactivate(id, currentUser) {
        await this.findActivePolicy(id);
        await this.assertNoOpenPolicyDependencies(id);
        const policy = (await this.prisma.commercialPolicy.update({
            where: { id },
            data: { isActive: false, updatedByUserId: currentUser.id },
        }));
        return this.toResponse(policy);
    }
    buildListWhere(query) {
        const search = query.search?.trim();
        return {
            ...(query.customerType ? { customerType: query.customerType } : {}),
            ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
            ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {}),
        };
    }
    buildPagination(query) {
        if (!query.limit)
            return {};
        return { skip: ((query.page ?? 1) - 1) * query.limit, take: query.limit };
    }
    normalizeMutationData(dto, userId, isCreate) {
        const name = dto.name?.trim();
        if (dto.name !== undefined && !name)
            throw new common_1.BadRequestException('Policy name is required');
        if (isCreate && !name)
            throw new common_1.BadRequestException('Policy name is required');
        if (dto.defaultCreditLimit !== undefined && dto.defaultCreditLimit < 0)
            throw new common_1.BadRequestException('Credit limit must be greater than or equal to zero');
        if (dto.defaultCreditDays !== undefined && dto.defaultCreditDays < 0)
            throw new common_1.BadRequestException('Credit days must be greater than or equal to zero');
        const overdueBlockingMode = dto.overdueBlockingMode?.trim();
        const creditLimitBlockingMode = dto.creditLimitBlockingMode?.trim();
        if (dto.defaultCreditDays !== undefined && dto.defaultCreditDays > 0 && !overdueBlockingMode) {
            throw new common_1.BadRequestException('overdueBlockingMode is required when credit days are configured');
        }
        if (dto.defaultCreditLimit !== undefined && dto.defaultCreditLimit > 0 && !creditLimitBlockingMode) {
            throw new common_1.BadRequestException('creditLimitBlockingMode is required when credit limit is configured');
        }
        const isActive = dto.isActive ?? (isCreate ? true : undefined);
        if (isActive === true && !dto.effectiveFrom)
            throw new common_1.BadRequestException('effectiveFrom is required for active policies');
        const effectiveFrom = dto.effectiveFrom !== undefined ? this.parseDate(dto.effectiveFrom, 'effectiveFrom') : undefined;
        const effectiveTo = dto.effectiveTo !== undefined && dto.effectiveTo !== null ? this.parseDate(dto.effectiveTo, 'effectiveTo') : null;
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
            throw new common_1.BadRequestException('effectiveTo must be greater than or equal to effectiveFrom');
        }
        return {
            ...(dto.name !== undefined ? { name } : {}),
            ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
            ...(dto.customerType !== undefined ? { customerType: dto.customerType } : {}),
            ...(dto.priceListId !== undefined ? { priceListId: dto.priceListId?.trim() || null } : {}),
            ...(dto.defaultCreditLimit !== undefined ? { defaultCreditLimit: dto.defaultCreditLimit } : {}),
            ...(dto.defaultCreditDays !== undefined ? { defaultCreditDays: dto.defaultCreditDays } : {}),
            ...(dto.overdueBlockingMode !== undefined ? { overdueBlockingMode: overdueBlockingMode || null } : {}),
            ...(dto.creditLimitBlockingMode !== undefined ? { creditLimitBlockingMode: creditLimitBlockingMode || null } : {}),
            ...(dto.allowAdministrativeOverride !== undefined ? { allowAdministrativeOverride: dto.allowAdministrativeOverride } : {}),
            ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
            ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
            ...(isActive !== undefined ? { isActive } : {}),
            ...(isCreate ? { createdByUserId: userId } : {}),
            updatedByUserId: userId,
        };
    }
    async findActivePolicy(id) {
        const policy = (await this.prisma.commercialPolicy.findFirst({ where: { id, isActive: true } }));
        if (!policy)
            throw new common_1.NotFoundException('Commercial policy not found');
        return policy;
    }
    async assertHistoricalConditionsAreNotOverwritten(id, dto) {
        const changesHistoricalConditions = HISTORICAL_POLICY_FIELDS.some((field) => dto[field] !== undefined);
        if (!changesHistoricalConditions)
            return;
        const [sale, accountReceivable] = await Promise.all([
            this.prisma.sale.findFirst({ where: { commercialPolicyId: id }, select: { id: true } }),
            this.prisma.accountReceivable.findFirst({ where: { commercialPolicyId: id }, select: { id: true } }),
        ]);
        if (sale || accountReceivable) {
            throw new common_1.BadRequestException('Cannot overwrite commercial conditions already applied to sales or accounts receivable');
        }
    }
    async assertNoOpenPolicyDependencies(id) {
        const openSale = await this.prisma.sale.findFirst({ where: { commercialPolicyId: id, status: { in: ['DRAFT', 'CONFIRMED'] } }, select: { id: true } });
        if (openSale)
            throw new common_1.BadRequestException('Cannot deactivate commercial policy with open sales');
        const openReceivable = await this.prisma.accountReceivable.findFirst({ where: { commercialPolicyId: id, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }, select: { id: true } });
        if (openReceivable)
            throw new common_1.BadRequestException('Cannot deactivate commercial policy with open receivables');
    }
    parseDate(value, field) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            throw new common_1.BadRequestException(`${field} must be a valid date`);
        return date;
    }
    toMutationSnapshot(policy) {
        return {
            name: policy.name,
            description: policy.description ?? undefined,
            customerType: policy.customerType ?? undefined,
            priceListId: policy.priceListId ?? undefined,
            defaultCreditLimit: policy.defaultCreditLimit === null ? undefined : Number(policy.defaultCreditLimit),
            defaultCreditDays: policy.defaultCreditDays ?? undefined,
            overdueBlockingMode: policy.overdueBlockingMode ?? undefined,
            creditLimitBlockingMode: policy.creditLimitBlockingMode ?? undefined,
            allowAdministrativeOverride: policy.allowAdministrativeOverride,
            effectiveFrom: policy.effectiveFrom?.toISOString(),
            effectiveTo: policy.effectiveTo?.toISOString() ?? null,
            isActive: policy.isActive,
        };
    }
    toResponse(policy) {
        return {
            id: policy.id,
            name: policy.name,
            description: policy.description,
            customerType: policy.customerType,
            priceListId: policy.priceListId,
            defaultCreditLimit: policy.defaultCreditLimit?.toString() ?? null,
            defaultCreditDays: policy.defaultCreditDays,
            overdueBlockingMode: policy.overdueBlockingMode,
            creditLimitBlockingMode: policy.creditLimitBlockingMode,
            allowAdministrativeOverride: policy.allowAdministrativeOverride,
            isActive: policy.isActive,
            effectiveFrom: policy.effectiveFrom,
            effectiveTo: policy.effectiveTo,
            createdByUserId: policy.createdByUserId,
            updatedByUserId: policy.updatedByUserId,
            createdAt: policy.createdAt,
            updatedAt: policy.updatedAt,
        };
    }
};
exports.CommercialPoliciesService = CommercialPoliciesService;
exports.CommercialPoliciesService = CommercialPoliciesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CommercialPoliciesService);
//# sourceMappingURL=commercial-policies.service.js.map