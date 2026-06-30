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
exports.ProductEquivalencesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let ProductEquivalencesService = class ProductEquivalencesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(productId, query = {}) {
        await this.assertProductExists(productId);
        const records = (await this.prisma.productUnitEquivalent.findMany({
            where: {
                productId,
                ...(query.status ? { status: query.status } : {}),
                ...(query.unitFrom ? { unitFrom: query.unitFrom } : {}),
                ...(query.unitTo ? { unitTo: query.unitTo } : {}),
                ...(query.date
                    ? {
                        effectiveFrom: { lte: this.parseDate(query.date, 'date') },
                        OR: [
                            { effectiveTo: null },
                            { effectiveTo: { gte: this.parseDate(query.date, 'date') } },
                        ],
                    }
                    : {}),
            },
            orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }],
        }));
        return { items: records.map((record) => this.toResponse(record)) };
    }
    async create(productId, userId, dto) {
        await this.assertProductExists(productId);
        this.assertValidUnitPair(dto.unitFrom, dto.unitTo);
        this.assertValidDates(dto.effectiveFrom, dto.effectiveTo);
        if (dto.status === 'ACTIVE') {
            this.assertEffectiveFrom(dto.effectiveFrom);
            await this.assertNoActiveOverlap({
                productId,
                unitFrom: dto.unitFrom,
                unitTo: dto.unitTo,
                effectiveFrom: this.parseOptionalDate(dto.effectiveFrom),
                effectiveTo: this.parseOptionalDate(dto.effectiveTo),
            });
        }
        const record = (await this.prisma.productUnitEquivalent.create({
            data: {
                productId,
                unitFrom: dto.unitFrom,
                unitTo: dto.unitTo,
                factor: dto.factor,
                roundingMode: dto.roundingMode ?? null,
                effectiveFrom: this.parseOptionalDate(dto.effectiveFrom),
                effectiveTo: this.parseOptionalDate(dto.effectiveTo),
                status: dto.status,
                createdByUserId: userId,
                approvedByUserId: dto.status === 'ACTIVE' ? userId : null,
            },
        }));
        return this.toResponse(record);
    }
    async update(id, userId, dto) {
        const current = await this.findExisting(id);
        const next = {
            unitFrom: dto.unitFrom ?? current.unitFrom,
            unitTo: dto.unitTo ?? current.unitTo,
            effectiveFrom: dto.effectiveFrom !== undefined ? this.parseOptionalDate(dto.effectiveFrom) : current.effectiveFrom,
            effectiveTo: dto.effectiveTo !== undefined ? this.parseOptionalDate(dto.effectiveTo) : current.effectiveTo,
            status: dto.status ?? current.status,
        };
        this.assertValidUnitPair(next.unitFrom, next.unitTo);
        this.assertValidDateOrder(next.effectiveFrom, next.effectiveTo);
        await this.assertHistoricalFieldsCanChange(current, dto);
        if (next.status === 'ACTIVE') {
            this.assertEffectiveFrom(next.effectiveFrom);
            await this.assertNoActiveOverlap({
                productId: current.productId,
                unitFrom: next.unitFrom,
                unitTo: next.unitTo,
                effectiveFrom: next.effectiveFrom,
                effectiveTo: next.effectiveTo,
                excludeId: id,
            });
        }
        const record = (await this.prisma.productUnitEquivalent.update({
            where: { id },
            data: {
                ...(dto.unitFrom !== undefined ? { unitFrom: dto.unitFrom } : {}),
                ...(dto.unitTo !== undefined ? { unitTo: dto.unitTo } : {}),
                ...(dto.factor !== undefined ? { factor: dto.factor } : {}),
                ...(dto.roundingMode !== undefined ? { roundingMode: dto.roundingMode ?? null } : {}),
                ...(dto.effectiveFrom !== undefined ? { effectiveFrom: next.effectiveFrom } : {}),
                ...(dto.effectiveTo !== undefined ? { effectiveTo: next.effectiveTo } : {}),
                ...(dto.status !== undefined ? { status: dto.status } : {}),
                ...(current.status !== 'ACTIVE' && next.status === 'ACTIVE' ? { approvedByUserId: userId } : {}),
            },
        }));
        return this.toResponse(record);
    }
    async activate(id, userId) {
        const current = await this.findExisting(id);
        this.assertEffectiveFrom(current.effectiveFrom);
        await this.assertNoActiveOverlap({
            productId: current.productId,
            unitFrom: current.unitFrom,
            unitTo: current.unitTo,
            effectiveFrom: current.effectiveFrom,
            effectiveTo: current.effectiveTo,
            excludeId: id,
        });
        const record = (await this.prisma.productUnitEquivalent.update({
            where: { id },
            data: { status: 'ACTIVE', approvedByUserId: userId },
        }));
        return this.toResponse(record);
    }
    async deactivate(id) {
        await this.findExisting(id);
        const record = (await this.prisma.productUnitEquivalent.update({
            where: { id },
            data: { status: 'INACTIVE' },
        }));
        return this.toResponse(record);
    }
    async assertProductExists(productId) {
        const product = await this.prisma.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true } });
        if (!product)
            throw new common_1.NotFoundException('Product not found');
    }
    async findExisting(id) {
        const record = (await this.prisma.productUnitEquivalent.findUnique({ where: { id } }));
        if (!record)
            throw new common_1.NotFoundException('Product equivalence not found');
        return record;
    }
    assertValidUnitPair(unitFrom, unitTo) {
        const allowedPair = (unitFrom === 'KG' && unitTo === 'PIECE') ||
            (unitFrom === 'PIECE' && unitTo === 'KG');
        if (!allowedPair) {
            throw new common_1.BadRequestException('Product equivalences only support KG to PIECE or PIECE to KG unit pairs');
        }
    }
    assertValidDates(effectiveFrom, effectiveTo) {
        this.assertValidDateOrder(this.parseOptionalDate(effectiveFrom), this.parseOptionalDate(effectiveTo));
    }
    assertValidDateOrder(effectiveFrom, effectiveTo) {
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
            throw new common_1.BadRequestException('effectiveTo must be greater than or equal to effectiveFrom');
        }
    }
    assertEffectiveFrom(effectiveFrom) {
        if (!effectiveFrom)
            throw new common_1.BadRequestException('effectiveFrom is required for active equivalences');
    }
    async assertHistoricalFieldsCanChange(current, dto) {
        const changesHistoricalField = dto.unitFrom !== undefined ||
            dto.unitTo !== undefined ||
            dto.factor !== undefined ||
            dto.effectiveFrom !== undefined ||
            dto.effectiveTo !== undefined;
        if (!changesHistoricalField)
            return;
        if (current.status === 'ACTIVE') {
            throw new common_1.BadRequestException('Active equivalence factors and vigencies cannot be overwritten; create a new equivalence period instead');
        }
        const [saleUsage, purchaseUsage] = await Promise.all([
            this.prisma.saleItem.count({ where: { unitEquivalentId: current.id } }),
            this.prisma.purchaseItem.count({ where: { unitEquivalentId: current.id } }),
        ]);
        if (saleUsage > 0 || purchaseUsage > 0) {
            throw new common_1.BadRequestException('Equivalence already has historical usage; create a new equivalence period instead of overwriting it');
        }
    }
    async assertNoActiveOverlap(input) {
        const overlapping = await this.prisma.productUnitEquivalent.findFirst({
            where: {
                productId: input.productId,
                unitFrom: input.unitFrom,
                unitTo: input.unitTo,
                status: 'ACTIVE',
                ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
                effectiveFrom: { lte: input.effectiveTo ?? new Date('9999-12-31T00:00:00.000Z') },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveFrom ?? new Date('0001-01-01T00:00:00.000Z') } }],
            },
            select: { id: true },
        });
        if (overlapping)
            throw new common_1.ConflictException('An active equivalence already applies for this product, unit pair, and period');
    }
    parseOptionalDate(value) {
        return value ? this.parseDate(value, 'date') : null;
    }
    parseDate(value, field) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            throw new common_1.BadRequestException(`${field} must be a valid date`);
        return date;
    }
    toResponse(record) {
        return { ...record, factor: Number(record.factor) };
    }
};
exports.ProductEquivalencesService = ProductEquivalencesService;
exports.ProductEquivalencesService = ProductEquivalencesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductEquivalencesService);
//# sourceMappingURL=product-equivalences.service.js.map