import { CreateProductDto, GetProductQueryDto, ListProductsQueryDto, UpdateProductDto } from './dto';
import { ProductsService } from './products.service';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    findAll(query: ListProductsQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: {
                id: string;
                name: string;
                sku: string | null;
                description: string | null;
                categoryId: string | null;
                presentationType: import("@prisma/client").ProductPresentationType;
                salePrice: number;
                purchaseCost: number;
                minStock: number;
                unit: import("@prisma/client").ProductUnit;
                pieceWeightEquivalent: number | null;
                equivalentPolicyStatus: import("@prisma/client").EquivalentStatus | null;
                isActive: boolean;
                inventoryBalance?: {
                    locationId: string;
                    locationName?: string;
                    quantityKg: number;
                    quantityPieces: number;
                    minQuantityKg: number;
                    minQuantityPieces: number;
                    isLowStock: boolean;
                };
                balances?: {
                    locationId: string;
                    locationName?: string;
                    quantityKg: number;
                    quantityPieces: number;
                    minQuantityKg: number;
                    minQuantityPieces: number;
                    isLowStock: boolean;
                }[];
                activeEquivalences?: {
                    id: string;
                    unitFrom: import("@prisma/client").ProductUnit;
                    unitTo: import("@prisma/client").ProductUnit;
                    factor: number;
                    roundingMode: string | null;
                    effectiveFrom: Date | null;
                }[];
            }[];
        };
    }>;
    findOne(id: string, query: GetProductQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            sku: string | null;
            description: string | null;
            categoryId: string | null;
            presentationType: import("@prisma/client").ProductPresentationType;
            salePrice: number;
            purchaseCost: number;
            minStock: number;
            unit: import("@prisma/client").ProductUnit;
            pieceWeightEquivalent: number | null;
            equivalentPolicyStatus: import("@prisma/client").EquivalentStatus | null;
            isActive: boolean;
            inventoryBalance?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            };
            balances?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            }[];
            activeEquivalences?: {
                id: string;
                unitFrom: import("@prisma/client").ProductUnit;
                unitTo: import("@prisma/client").ProductUnit;
                factor: number;
                roundingMode: string | null;
                effectiveFrom: Date | null;
            }[];
        };
    }>;
    create(body: CreateProductDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            sku: string | null;
            description: string | null;
            categoryId: string | null;
            presentationType: import("@prisma/client").ProductPresentationType;
            salePrice: number;
            purchaseCost: number;
            minStock: number;
            unit: import("@prisma/client").ProductUnit;
            pieceWeightEquivalent: number | null;
            equivalentPolicyStatus: import("@prisma/client").EquivalentStatus | null;
            isActive: boolean;
            inventoryBalance?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            };
            balances?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            }[];
            activeEquivalences?: {
                id: string;
                unitFrom: import("@prisma/client").ProductUnit;
                unitTo: import("@prisma/client").ProductUnit;
                factor: number;
                roundingMode: string | null;
                effectiveFrom: Date | null;
            }[];
        };
    }>;
    update(id: string, body: UpdateProductDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            sku: string | null;
            description: string | null;
            categoryId: string | null;
            presentationType: import("@prisma/client").ProductPresentationType;
            salePrice: number;
            purchaseCost: number;
            minStock: number;
            unit: import("@prisma/client").ProductUnit;
            pieceWeightEquivalent: number | null;
            equivalentPolicyStatus: import("@prisma/client").EquivalentStatus | null;
            isActive: boolean;
            inventoryBalance?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            };
            balances?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            }[];
            activeEquivalences?: {
                id: string;
                unitFrom: import("@prisma/client").ProductUnit;
                unitTo: import("@prisma/client").ProductUnit;
                factor: number;
                roundingMode: string | null;
                effectiveFrom: Date | null;
            }[];
        };
    }>;
    deactivate(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            sku: string | null;
            description: string | null;
            categoryId: string | null;
            presentationType: import("@prisma/client").ProductPresentationType;
            salePrice: number;
            purchaseCost: number;
            minStock: number;
            unit: import("@prisma/client").ProductUnit;
            pieceWeightEquivalent: number | null;
            equivalentPolicyStatus: import("@prisma/client").EquivalentStatus | null;
            isActive: boolean;
            inventoryBalance?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            };
            balances?: {
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            }[];
            activeEquivalences?: {
                id: string;
                unitFrom: import("@prisma/client").ProductUnit;
                unitTo: import("@prisma/client").ProductUnit;
                factor: number;
                roundingMode: string | null;
                effectiveFrom: Date | null;
            }[];
        };
    }>;
}
