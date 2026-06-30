import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateProductEquivalenceDto, ListProductEquivalencesQueryDto, UpdateProductEquivalenceDto } from './dto';
import { ProductEquivalencesService } from './product-equivalences.service';
export declare class ProductEquivalencesController {
    private readonly productEquivalencesService;
    constructor(productEquivalencesService: ProductEquivalencesService);
    findAll(productId: string, query: ListProductEquivalencesQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: (Omit<{
                id: string;
                productId: string;
                unitFrom: import("@prisma/client").ProductUnit;
                unitTo: import("@prisma/client").ProductUnit;
                factor: string | number | import("@prisma/client/runtime/library").Decimal;
                roundingMode: string | null;
                effectiveFrom: Date | null;
                effectiveTo: Date | null;
                status: import("@prisma/client").EquivalentStatus;
                approvedByUserId: string | null;
                createdByUserId: string;
                createdAt?: Date;
                updatedAt?: Date;
            }, "factor"> & {
                factor: number;
            })[];
        };
    }>;
    create(productId: string, user: AuthenticatedUser, body: CreateProductEquivalenceDto): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            productId: string;
            unitFrom: import("@prisma/client").ProductUnit;
            unitTo: import("@prisma/client").ProductUnit;
            factor: string | number | import("@prisma/client/runtime/library").Decimal;
            roundingMode: string | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            status: import("@prisma/client").EquivalentStatus;
            approvedByUserId: string | null;
            createdByUserId: string;
            createdAt?: Date;
            updatedAt?: Date;
        }, "factor"> & {
            factor: number;
        };
    }>;
    update(id: string, user: AuthenticatedUser, body: UpdateProductEquivalenceDto): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            productId: string;
            unitFrom: import("@prisma/client").ProductUnit;
            unitTo: import("@prisma/client").ProductUnit;
            factor: string | number | import("@prisma/client/runtime/library").Decimal;
            roundingMode: string | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            status: import("@prisma/client").EquivalentStatus;
            approvedByUserId: string | null;
            createdByUserId: string;
            createdAt?: Date;
            updatedAt?: Date;
        }, "factor"> & {
            factor: number;
        };
    }>;
    activate(id: string, user: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            productId: string;
            unitFrom: import("@prisma/client").ProductUnit;
            unitTo: import("@prisma/client").ProductUnit;
            factor: string | number | import("@prisma/client/runtime/library").Decimal;
            roundingMode: string | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            status: import("@prisma/client").EquivalentStatus;
            approvedByUserId: string | null;
            createdByUserId: string;
            createdAt?: Date;
            updatedAt?: Date;
        }, "factor"> & {
            factor: number;
        };
    }>;
    deactivate(id: string): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            productId: string;
            unitFrom: import("@prisma/client").ProductUnit;
            unitTo: import("@prisma/client").ProductUnit;
            factor: string | number | import("@prisma/client/runtime/library").Decimal;
            roundingMode: string | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            status: import("@prisma/client").EquivalentStatus;
            approvedByUserId: string | null;
            createdByUserId: string;
            createdAt?: Date;
            updatedAt?: Date;
        }, "factor"> & {
            factor: number;
        };
    }>;
}
