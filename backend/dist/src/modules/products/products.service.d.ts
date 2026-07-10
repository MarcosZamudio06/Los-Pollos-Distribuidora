import type { EquivalentStatus, ProductPresentationType, ProductUnit } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto, GetProductQueryDto, ListProductsQueryDto, UpdateProductDto } from './dto';
type ProductResponse = {
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    categoryId: string | null;
    presentationType: ProductPresentationType;
    salePrice: number;
    purchaseCost: number;
    minStock: number;
    unit: ProductUnit;
    pieceWeightEquivalent: number | null;
    equivalentPolicyStatus: EquivalentStatus | null;
    isActive: boolean;
    inventoryBalance?: InventoryBalanceResponse;
    balances?: InventoryBalanceResponse[];
    activeEquivalences?: ProductEquivalentResponse[];
};
type InventoryBalanceResponse = {
    locationId: string;
    locationName?: string;
    quantityKg: number;
    quantityPieces: number;
    minQuantityKg: number;
    minQuantityPieces: number;
    isLowStock: boolean;
};
type ProductEquivalentResponse = {
    id: string;
    unitFrom: ProductUnit;
    unitTo: ProductUnit;
    factor: number;
    roundingMode: string | null;
    effectiveFrom: Date | null;
};
type ProductListResponse = {
    items: ProductResponse[];
};
export declare class ProductsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(query: ListProductsQueryDto): Promise<ProductListResponse>;
    findOne(id: string, query?: GetProductQueryDto): Promise<ProductResponse>;
    create(dto: CreateProductDto): Promise<ProductResponse>;
    update(id: string, dto: UpdateProductDto): Promise<ProductResponse>;
    deactivate(id: string): Promise<ProductResponse>;
    assertProductCanBeSold(id: string): Promise<void>;
    private buildListWhere;
    private buildListInclude;
    private buildPagination;
    private findActiveProductForMutation;
    private assertValidCommercialData;
    private assertCategoryExists;
    private assertSkuAvailable;
    private normalizeSku;
    private normalizeOptionalText;
    private toProductResponse;
    private toInventoryBalanceResponse;
    private toNullableNumber;
    private toNumber;
    private throwDuplicateSkuConflict;
    private isUniqueConstraintError;
}
export {};
