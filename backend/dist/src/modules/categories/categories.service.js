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
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let CategoriesService = class CategoriesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query = {}) {
        const categories = (await this.prisma.category.findMany({
            where: this.buildListWhere(query),
            orderBy: { name: 'asc' },
            ...this.buildPagination(query),
        }));
        return {
            items: categories.map((category) => this.toCategoryResponse(category)),
        };
    }
    async create(dto) {
        const data = this.normalizeMutationData(dto);
        await this.assertNameAvailable(data.name);
        const category = (await this.prisma.category
            .create({
            data: {
                name: data.name,
                description: data.description ?? null,
                isActive: true,
            },
        })
            .catch((error) => {
            this.throwDuplicateNameConflict(error);
            throw error;
        }));
        return this.toCategoryResponse(category);
    }
    async update(id, dto) {
        const data = this.normalizeMutationData(dto);
        const currentCategory = await this.findActiveCategoryForMutation(id);
        if (data.name !== undefined) {
            await this.assertNameAvailable(data.name, currentCategory.id);
        }
        const category = (await this.prisma.category
            .update({
            where: { id: currentCategory.id },
            data,
        })
            .catch((error) => {
            this.throwDuplicateNameConflict(error);
            throw error;
        }));
        return this.toCategoryResponse(category);
    }
    async deactivate(id) {
        const currentCategory = await this.findActiveCategoryForMutation(id);
        const category = (await this.prisma.category.update({
            where: { id: currentCategory.id },
            data: { isActive: false },
        }));
        return this.toCategoryResponse(category);
    }
    buildListWhere(query) {
        const search = query.search?.trim();
        return {
            isActive: query.isActive ?? true,
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } },
                    ],
                }
                : {}),
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
    async findActiveCategoryForMutation(id) {
        const category = (await this.prisma.category.findFirst({
            where: { id, isActive: true },
        }));
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async assertNameAvailable(name, currentCategoryId) {
        const existingCategory = await this.prisma.category.findUnique({
            where: { name },
            select: { id: true },
        });
        if (existingCategory && existingCategory.id !== currentCategoryId) {
            throw new common_1.ConflictException('Category name is already registered');
        }
    }
    normalizeMutationData(dto) {
        const name = dto.name !== undefined ? dto.name.trim() : undefined;
        if (name !== undefined && name.length === 0) {
            throw new common_1.BadRequestException('name is required');
        }
        return {
            ...(name !== undefined ? { name } : {}),
            ...(dto.description !== undefined
                ? { description: this.normalizeOptionalText(dto.description) }
                : {}),
        };
    }
    normalizeOptionalText(value) {
        if (value === undefined || value === null) {
            return null;
        }
        const normalizedValue = value.trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
    }
    toCategoryResponse(category) {
        return {
            id: category.id,
            name: category.name,
            description: category.description,
            isActive: category.isActive,
        };
    }
    throwDuplicateNameConflict(error) {
        if (this.isUniqueConstraintError(error)) {
            throw new common_1.ConflictException('Category name is already registered');
        }
    }
    isUniqueConstraintError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002');
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map