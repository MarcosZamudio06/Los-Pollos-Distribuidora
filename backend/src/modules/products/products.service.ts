import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  EquivalentStatus,
  Prisma,
  ProductPresentationType,
  ProductUnit,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateProductDto,
  GetProductQueryDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto';

const PRODUCT_INCLUDE = {
  category: true,
} as const;

const ACTIVE_EQUIVALENCES_INCLUDE = {
  where: { status: 'ACTIVE' as EquivalentStatus },
  orderBy: { effectiveFrom: 'desc' as const },
} as const;

type DecimalLike = Prisma.Decimal | number | string;

type ProductRecord = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  categoryId: string | null;
  presentationType: ProductPresentationType;
  salePrice: DecimalLike;
  purchaseCost: DecimalLike;
  minStock: DecimalLike;
  unit: ProductUnit;
  pieceWeightEquivalent: DecimalLike | null;
  equivalentPolicyStatus: EquivalentStatus | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  category?: { id: string; name: string; description?: string | null } | null;
  inventoryBalances?: InventoryBalanceRecord[];
  unitEquivalents?: ProductEquivalentRecord[];
};

type InventoryBalanceRecord = {
  locationId: string;
  location?: { id: string; name: string } | null;
  quantityKg: DecimalLike;
  quantityPieces: number;
  minQuantityKg: DecimalLike;
  minQuantityPieces: number;
};

type ProductEquivalentRecord = {
  id: string;
  unitFrom: ProductUnit;
  unitTo: ProductUnit;
  factor: DecimalLike;
  roundingMode: string | null;
  effectiveFrom: Date | null;
};

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

type ProductListResponse = { items: ProductResponse[] };

type ProductMutationDto = CreateProductDto | UpdateProductDto;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProductsQueryDto): Promise<ProductListResponse> {
    if (query.lowStock === true && !query.locationId) {
      throw new BadRequestException(
        'locationId is required for lowStock filter',
      );
    }

    const products = (await this.prisma.product.findMany({
      where: this.buildListWhere(query),
      include: this.buildListInclude(query.locationId),
      orderBy: { name: 'asc' },
      ...this.buildPagination(query),
    })) as ProductRecord[];

    const items = products.map((product) => this.toProductResponse(product));

    return {
      items:
        query.lowStock === true
          ? items.filter((item) => item.inventoryBalance?.isLowStock === true)
          : items,
    };
  }

  async findOne(
    id: string,
    query: GetProductQueryDto = {},
  ): Promise<ProductResponse> {
    const includeBalances =
      query.includeBalances === true || !!query.locationId;
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
    })) as ProductRecord | null;

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toProductResponse(product, { includeBalances: true });
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
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
      .catch((error: unknown) => {
        this.throwDuplicateSkuConflict(error);
        throw error;
      })) as ProductRecord;

    return this.toProductResponse(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
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
      .catch((error: unknown) => {
        this.throwDuplicateSkuConflict(error);
        throw error;
      })) as ProductRecord;

    return this.toProductResponse(product);
  }

  async deactivate(id: string): Promise<ProductResponse> {
    const currentProduct = await this.findActiveProductForMutation(id);
    const product = (await this.prisma.product.update({
      where: { id: currentProduct.id },
      data: { isActive: false },
      include: PRODUCT_INCLUDE,
    })) as ProductRecord;

    return this.toProductResponse(product);
  }

  async assertProductCanBeSold(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Inactive products cannot be sold');
    }
  }

  private buildListWhere(
    query: ListProductsQueryDto,
  ): Prisma.ProductWhereInput {
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

  private buildListInclude(locationId?: string) {
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

  private buildPagination(query: ListProductsQueryDto): {
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

  private async findActiveProductForMutation(
    id: string,
  ): Promise<ProductRecord> {
    const product = (await this.prisma.product.findFirst({
      where: { id, isActive: true },
    })) as ProductRecord | null;

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private assertValidCommercialData(dto: ProductMutationDto): void {
    if (dto.salePrice !== undefined && dto.salePrice <= 0) {
      throw new BadRequestException('salePrice must be greater than 0');
    }

    if (dto.purchaseCost !== undefined && dto.purchaseCost < 0) {
      throw new BadRequestException(
        'purchaseCost must be greater than or equal to 0',
      );
    }

    if (dto.minStock !== undefined && dto.minStock < 0) {
      throw new BadRequestException(
        'minStock must be greater than or equal to 0',
      );
    }

    const isKiloAndPiece = dto.unit === ('KG_AND_PIECE' as ProductUnit);
    const hasPieceWeightEquivalent =
      dto.pieceWeightEquivalent !== undefined &&
      dto.pieceWeightEquivalent !== null;
    const hasDraftEquivalentPolicy =
      dto.equivalentPolicyStatus === ('DRAFT' as EquivalentStatus);

    if (
      isKiloAndPiece &&
      !hasPieceWeightEquivalent &&
      !hasDraftEquivalentPolicy
    ) {
      throw new BadRequestException(
        'KG_AND_PIECE products require an equivalent factor or draft policy status',
      );
    }
  }

  private async assertCategoryExists(categoryId?: string): Promise<void> {
    if (!categoryId) {
      return;
    }

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, isActive: true },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Category does not exist');
    }
  }

  private async assertSkuAvailable(
    sku: string | null | undefined,
    currentProductId?: string,
  ): Promise<void> {
    if (sku === undefined || sku === null) {
      return;
    }

    const existingProduct = await this.prisma.product.findUnique({
      where: { sku },
      select: { id: true },
    });

    if (existingProduct && existingProduct.id !== currentProductId) {
      throw new ConflictException('SKU is already registered');
    }
  }

  private normalizeSku(sku?: string | null): string | null | undefined {
    if (sku === undefined) {
      return undefined;
    }

    if (sku === null) {
      return null;
    }

    const normalizedSku = sku.trim().toUpperCase();

    return normalizedSku.length > 0 ? normalizedSku : null;
  }

  private toProductResponse(
    product: ProductRecord,
    options: { includeBalances?: boolean } = {},
  ): ProductResponse {
    const response: ProductResponse = {
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
      pieceWeightEquivalent: this.toNullableNumber(
        product.pieceWeightEquivalent,
      ),
      equivalentPolicyStatus: product.equivalentPolicyStatus,
      isActive: product.isActive,
    };

    const balance = product.inventoryBalances?.[0];
    if (balance) {
      response.inventoryBalance = this.toInventoryBalanceResponse(balance);
    }

    if (options.includeBalances && product.inventoryBalances) {
      response.balances = product.inventoryBalances.map((item) =>
        this.toInventoryBalanceResponse(item),
      );
    }

    if (product.unitEquivalents) {
      response.activeEquivalences = product.unitEquivalents.map(
        (equivalence) => ({
          id: equivalence.id,
          unitFrom: equivalence.unitFrom,
          unitTo: equivalence.unitTo,
          factor: this.toNumber(equivalence.factor),
          roundingMode: equivalence.roundingMode,
          effectiveFrom: equivalence.effectiveFrom,
        }),
      );
    }

    return response;
  }

  private toInventoryBalanceResponse(
    balance: InventoryBalanceRecord,
  ): InventoryBalanceResponse {
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
      isLowStock:
        quantityKg < minQuantityKg ||
        balance.quantityPieces < balance.minQuantityPieces,
    };
  }

  private toNullableNumber(value: DecimalLike | null): number | null {
    return value === null ? null : this.toNumber(value);
  }

  private toNumber(value: DecimalLike): number {
    return Number(value.toString());
  }

  private throwDuplicateSkuConflict(error: unknown): void {
    if (this.isUniqueConstraintError(error)) {
      throw new ConflictException('SKU is already registered');
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
