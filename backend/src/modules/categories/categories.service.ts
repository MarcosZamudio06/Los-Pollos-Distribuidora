import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto';

type CategoryRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type CategoryResponse = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type CategoryListResponse = { items: CategoryResponse[] };

type CategoryMutationDto = CreateCategoryDto | UpdateCategoryDto;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListCategoriesQueryDto = {},
  ): Promise<CategoryListResponse> {
    const categories = (await this.prisma.category.findMany({
      where: this.buildListWhere(query),
      orderBy: { name: 'asc' },
      ...this.buildPagination(query),
    })) as CategoryRecord[];

    return {
      items: categories.map((category) => this.toCategoryResponse(category)),
    };
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponse> {
    const data = this.normalizeMutationData(dto) as Required<
      Pick<CategoryResponse, 'name'>
    > & { description?: string | null };

    await this.assertNameAvailable(data.name);

    const category = (await this.prisma.category
      .create({
        data: {
          name: data.name,
          description: data.description ?? null,
          isActive: true,
        },
      })
      .catch((error: unknown) => {
        this.throwDuplicateNameConflict(error);
        throw error;
      })) as CategoryRecord;

    return this.toCategoryResponse(category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
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
      .catch((error: unknown) => {
        this.throwDuplicateNameConflict(error);
        throw error;
      })) as CategoryRecord;

    return this.toCategoryResponse(category);
  }

  async deactivate(id: string): Promise<CategoryResponse> {
    const currentCategory = await this.findActiveCategoryForMutation(id);
    const category = (await this.prisma.category.update({
      where: { id: currentCategory.id },
      data: { isActive: false },
    })) as CategoryRecord;

    return this.toCategoryResponse(category);
  }

  private buildListWhere(
    query: ListCategoriesQueryDto,
  ): Prisma.CategoryWhereInput {
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

  private buildPagination(query: ListCategoriesQueryDto): {
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

  private async findActiveCategoryForMutation(
    id: string,
  ): Promise<CategoryRecord> {
    const category = (await this.prisma.category.findFirst({
      where: { id, isActive: true },
    })) as CategoryRecord | null;

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private async assertNameAvailable(
    name: string,
    currentCategoryId?: string,
  ): Promise<void> {
    const existingCategory = await this.prisma.category.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existingCategory && existingCategory.id !== currentCategoryId) {
      throw new ConflictException('Category name is already registered');
    }
  }

  private normalizeMutationData(
    dto: CategoryMutationDto,
  ): Partial<Pick<CategoryResponse, 'name' | 'description'>> {
    const name = dto.name !== undefined ? dto.name.trim() : undefined;

    if (name !== undefined && name.length === 0) {
      throw new BadRequestException('name is required');
    }

    return {
      ...(name !== undefined ? { name } : {}),
      ...(dto.description !== undefined
        ? { description: this.normalizeOptionalText(dto.description) }
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

  private toCategoryResponse(category: CategoryRecord): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
    };
  }

  private throwDuplicateNameConflict(error: unknown): void {
    if (this.isUniqueConstraintError(error)) {
      throw new ConflictException('Category name is already registered');
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
