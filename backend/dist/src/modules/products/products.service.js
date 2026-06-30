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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const PRODUCT_INCLUDE = {
    category: true,
};
const ACTIVE_EQUIVALENCES_INCLUDE = {
    where: { status: 'ACTIVE' },
    orderBy: { effectiveFrom: 'desc' },
};
let ProductsService = class ProductsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        if (query.lowStock === true && !query.locationId) {
            throw new common_1.BadRequestException('locationId is required for lowStock filter');
        }
        const products = (await this.prisma.product.findMany({
            where: this.buildListWhere(query),
            include: this.buildListInclude(query.locationId),
            orderBy: { name: 'asc' },
            ...this.buildPagination(query),
        }));
        const items = products.map((product) => this.toProductResponse(product));
        return {
            items: query.lowStock === true
                ? items.filter((item) => item.inventoryBalance?.isLowStock === true)
                : items,
        };
    }
    async findOne(id, query = {}) {
        const includeBalances = query.includeBalances === true || !!query.locationId;
        const product = (await this.prisma.product.findUnique({
            where: { id },
            include: {
                ...PRODUCT_INCLUDE,
                unitEquivalents: ACTIVE_EQUIVALENCES_INCLUDE,
                ...(includeBalances
                    ? {
                        inventoryBalances: {
                            where: query.locationId ? { locationId: query.locationId } : {},
                            include: { location: true },
                        },
                    }
                    : {}),
            },
        }));
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return this.toProductResponse(product, { includeBalances: true });
    }
    async create(dto) {
        this.assertValidCommercialData(dto);
        const sku = this.normalizeSku(dto.sku);
        await this.assertSkuAvailable(sku);
        await this.assertCategoryExists(dto.categoryId);
        const product = (await this.prisma.product
            .create({
            data: {
                name: dto.name,
                sku,
                description: dto.description ?? null,
                categoryId: dto.categoryId ?? null,
                presentationType: dto.presentationType,
                salePrice: dto.salePrice,
                purchaseCost: dto.purchaseCost,
                minStock: dto.minStock,
                unit: dto.unit,
                pieceWeightEquivalent: dto.pieceWeightEquivalent ?? null,
                equivalentPolicyStatus: dto.equivalentPolicyStatus ?? null,
                isActive: true,
            },
            include: PRODUCT_INCLUDE,
        })
            .catch((error) => {
            this.throwDuplicateSkuConflict(error);
            throw error;
        }));
        return this.toProductResponse(product);
    }
    async update(id, dto) {
        const currentProduct = await this.findActiveProductForMutation(id);
        this.assertValidCommercialData(dto);
        const sku = this.normalizeSku(dto.sku);
        if (sku !== undefined) {
            await this.assertSkuAvailable(sku, id);
        }
        await this.assertCategoryExists(dto.categoryId);
        const product = (await this.prisma.product
            .update({
            where: { id: currentProduct.id },
            data: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.sku !== undefined ? { sku } : {}),
                ...(dto.description !== undefined
                    ? { description: dto.description ?? null }
                    : {}),
                ...(dto.categoryId !== undefined
                    ? { categoryId: dto.categoryId ?? null }
                    : {}),
                ...(dto.presentationType !== undefined
                    ? { presentationType: dto.presentationType }
                    : {}),
                ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
                ...(dto.purchaseCost !== undefined
                    ? { purchaseCost: dto.purchaseCost }
                    : {}),
                ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
                ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
                ...(dto.pieceWeightEquivalent !== undefined
                    ? { pieceWeightEquivalent: dto.pieceWeightEquivalent ?? null }
                    : {}),
                ...(dto.equivalentPolicyStatus !== undefined
                    ? { equivalentPolicyStatus: dto.equivalentPolicyStatus ?? null }
                    : {}),
            },
            include: PRODUCT_INCLUDE,
        })
            .catch((error) => {
            this.throwDuplicateSkuConflict(error);
            throw error;
        }));
        return this.toProductResponse(product);
    }
    async deactivate(id) {
        const currentProduct = await this.findActiveProductForMutation(id);
        const product = (await this.prisma.product.update({
            where: { id: currentProduct.id },
            data: { isActive: false },
            include: PRODUCT_INCLUDE,
        }));
        return this.toProductResponse(product);
    }
    async assertProductCanBeSold(id) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            select: { id: true, isActive: true },
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        if (!product.isActive) {
            throw new common_1.BadRequestException('Inactive products cannot be sold');
        }
    }
    buildListWhere(query) {
        const search = query.search?.trim();
        return {
            isActive: query.isActive ?? true,
            ...(query.categoryId ? { categoryId: query.categoryId } : {}),
            ...(query.presentationType
                ? { presentationType: query.presentationType }
                : {}),
            ...(query.unit ? { unit: query.unit } : {}),
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { sku: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
    }
    buildListInclude(locationId) {
        if (!locationId) {
            return PRODUCT_INCLUDE;
        }
        return {
            ...PRODUCT_INCLUDE,
            inventoryBalances: {
                where: { locationId },
            },
        };
    }
    buildPagination(query) {
        if (!query.limit) {
            return {};
        }
        return {
            skip: ((query.page ?? 1) - 1) * query.limit,
            take: query.limit,
        };
    }
    async findActiveProductForMutation(id) {
        const product = (await this.prisma.product.findFirst({
            where: { id, isActive: true },
        }));
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    assertValidCommercialData(dto) {
        if (dto.salePrice !== undefined && dto.salePrice <= 0) {
            throw new common_1.BadRequestException('salePrice must be greater than 0');
        }
        if (dto.purchaseCost !== undefined && dto.purchaseCost < 0) {
            throw new common_1.BadRequestException('purchaseCost must be greater than or equal to 0');
        }
        if (dto.minStock !== undefined && dto.minStock < 0) {
            throw new common_1.BadRequestException('minStock must be greater than or equal to 0');
        }
        const isKiloAndPiece = dto.unit === 'KG_AND_PIECE';
        const hasPieceWeightEquivalent = dto.pieceWeightEquivalent !== undefined &&
            dto.pieceWeightEquivalent !== null;
        const hasDraftEquivalentPolicy = dto.equivalentPolicyStatus === 'DRAFT';
        if (isKiloAndPiece &&
            !hasPieceWeightEquivalent &&
            !hasDraftEquivalentPolicy) {
            throw new common_1.BadRequestException('KG_AND_PIECE products require an equivalent factor or draft policy status');
        }
    }
    async assertCategoryExists(categoryId) {
        if (!categoryId) {
            return;
        }
        const category = await this.prisma.category.findFirst({
            where: { id: categoryId, isActive: true },
            select: { id: true },
        });
        if (!category) {
            throw new common_1.BadRequestException('Category does not exist');
        }
    }
    async assertSkuAvailable(sku, currentProductId) {
        if (sku === undefined || sku === null) {
            return;
        }
        const existingProduct = await this.prisma.product.findUnique({
            where: { sku },
            select: { id: true },
        });
        if (existingProduct && existingProduct.id !== currentProductId) {
            throw new common_1.ConflictException('SKU is already registered');
        }
    }
    normalizeSku(sku) {
        if (sku === undefined) {
            return undefined;
        }
        if (sku === null) {
            return null;
        }
        const normalizedSku = sku.trim().toUpperCase();
        return normalizedSku.length > 0 ? normalizedSku : null;
    }
    toProductResponse(product, options = {}) {
        const response = {
            id: product.id,
            name: product.name,
            sku: product.sku,
            description: product.description,
            categoryId: product.categoryId,
            presentationType: product.presentationType,
            salePrice: this.toNumber(product.salePrice),
            purchaseCost: this.toNumber(product.purchaseCost),
            minStock: this.toNumber(product.minStock),
            unit: product.unit,
            pieceWeightEquivalent: this.toNullableNumber(product.pieceWeightEquivalent),
            equivalentPolicyStatus: product.equivalentPolicyStatus,
            isActive: product.isActive,
        };
        const balance = product.inventoryBalances?.[0];
        if (balance) {
            response.inventoryBalance = this.toInventoryBalanceResponse(balance);
        }
        if (options.includeBalances && product.inventoryBalances) {
            response.balances = product.inventoryBalances.map((item) => this.toInventoryBalanceResponse(item));
        }
        if (product.unitEquivalents) {
            response.activeEquivalences = product.unitEquivalents.map((equivalence) => ({
                id: equivalence.id,
                unitFrom: equivalence.unitFrom,
                unitTo: equivalence.unitTo,
                factor: this.toNumber(equivalence.factor),
                roundingMode: equivalence.roundingMode,
                effectiveFrom: equivalence.effectiveFrom,
            }));
        }
        return response;
    }
    toInventoryBalanceResponse(balance) {
        const quantityKg = this.toNumber(balance.quantityKg);
        const minQuantityKg = this.toNumber(balance.minQuantityKg);
        return {
            locationId: balance.locationId,
            ...(balance.location?.name
                ? { locationName: balance.location.name }
                : {}),
            quantityKg,
            quantityPieces: balance.quantityPieces,
            minQuantityKg,
            minQuantityPieces: balance.minQuantityPieces,
            isLowStock: quantityKg < minQuantityKg ||
                balance.quantityPieces < balance.minQuantityPieces,
        };
    }
    toNullableNumber(value) {
        return value === null ? null : this.toNumber(value);
    }
    toNumber(value) {
        return Number(value.toString());
    }
    throwDuplicateSkuConflict(error) {
        if (this.isUniqueConstraintError(error)) {
            throw new common_1.ConflictException('SKU is already registered');
        }
    }
    isUniqueConstraintError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002');
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map