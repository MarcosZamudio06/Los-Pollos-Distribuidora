import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto, ListCategoriesQueryDto, UpdateCategoryDto } from './dto';
type CategoryResponse = {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
};
type CategoryListResponse = {
    items: CategoryResponse[];
};
export declare class CategoriesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(query?: ListCategoriesQueryDto): Promise<CategoryListResponse>;
    create(dto: CreateCategoryDto): Promise<CategoryResponse>;
    update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse>;
    deactivate(id: string): Promise<CategoryResponse>;
    private buildListWhere;
    private buildPagination;
    private findActiveCategoryForMutation;
    private assertNameAvailable;
    private normalizeMutationData;
    private normalizeOptionalText;
    private toCategoryResponse;
    private throwDuplicateNameConflict;
    private isUniqueConstraintError;
}
export {};
