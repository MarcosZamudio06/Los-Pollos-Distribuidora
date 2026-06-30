import { CreateCategoryDto, ListCategoriesQueryDto, UpdateCategoryDto } from './dto';
import { CategoriesService } from './categories.service';
export declare class CategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: CategoriesService);
    findAll(query: ListCategoriesQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: {
                id: string;
                name: string;
                description: string | null;
                isActive: boolean;
            }[];
        };
    }>;
    create(body: CreateCategoryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            description: string | null;
            isActive: boolean;
        };
    }>;
    update(id: string, body: UpdateCategoryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            description: string | null;
            isActive: boolean;
        };
    }>;
    deactivate(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            description: string | null;
            isActive: boolean;
        };
    }>;
}
