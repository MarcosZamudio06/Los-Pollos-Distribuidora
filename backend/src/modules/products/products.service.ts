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
import { PERMISSIONS } from '../../common/authorization/permissions';
import type { AuthenticatedUser } from '../auth/auth.types';
import { toInventoryBalanceAvailability } from '../inventory/inventory-balance.service';
import {
  CreateProductDto,
  GetProductQueryDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto';
import {
  isValidSatProductFactorType,
  isValidSatProductServiceCode,
  isValidSatProductTaxCode,
  isValidSatProductTaxObjectCode,
  isValidSatUnitCode,
  normalizeProductFactorType,
  normalizeProductFiscalCode,
  productFiscalProfileStatus,
  type ProductFactorType,
  type ProductFiscalProfileField,
  type ProductTaxCode,
  type ProductTaxObjectCode,
} from '../../../../shared/product-fiscal-catalog';

const PRODUCT_INCLUDE = {
  category: true,
} as const;

const ACTIVE_EQUIVALENCES_INCLUDE = {
  where: { status: 'ACTIVE' as EquivalentStatus },
  orderBy: { effectiveFrom: 'desc' as const },
} as const;

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type ProductRecord = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  presentationType: ProductPresentationType;
  salePrice: DecimalLike;
  purchaseCost: DecimalLike;
  minStock: DecimalLike;
  unit: ProductUnit;
  satProductServiceCode?: string | null;
  satUnitCode?: string | null;
  taxObjectCode?: string | null;
  defaultTaxCode?: string | null;
  defaultFactorType?: string | null;
  defaultRateOrQuota?: DecimalLike;
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
  productId?: string;
  locationId: string;
  location?: { id: string; name: string } | null;
  quantityKg: DecimalLike;
  quantityPieces: number;
  reservedQuantityKg?: DecimalLike;
  reservedQuantityPieces?: number;
  minQuantityKg?: DecimalLike;
  minQuantityPieces?: number;
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
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  presentationType: ProductPresentationType;
  salePrice: number;
  purchaseCost?: number;
  minStock: number;
  unit: ProductUnit;
  satProductServiceCode: string | null;
  satUnitCode: string | null;
  taxObjectCode: ProductTaxObjectCode | null;
  defaultTaxCode: ProductTaxCode | null;
  defaultFactorType: ProductFactorType | null;
  defaultRateOrQuota: number | null;
  fiscalProfileStatus: 'COMPLETE' | 'INCOMPLETE';
  fiscalProfileComplete: boolean;
  fiscalProfileMissingFields: ProductFiscalProfileField[];
  fiscalProfileValidationCode: string | null;
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
  reservedQuantityKg: number;
  reservedQuantityPieces: number;
  availableQuantityKg: number;
  availableQuantityPieces: number;
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
type ProductReadActor = Pick<AuthenticatedUser, 'role' | 'permissions'> &
  Partial<Pick<AuthenticatedUser, 'operationalLocationId'>>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListProductsQueryDto,
    currentUser: ProductReadActor,
  ): Promise<ProductListResponse> {
    if (query.lowStock === true && !query.locationId) {
      throw new BadRequestException(
        'locationId is required for lowStock filter',
      );
    }
    if (query.requireInventoryBalance === true && !query.locationId) {
      throw new BadRequestException(
        'locationId is required for requireInventoryBalance filter',
      );
    }

    const search = query.search?.trim();
    const where = this.buildListWhere(query, currentUser);
    const include = this.buildListInclude(
      query.locationId,
      currentUser,
      query.requireInventoryBalance === true,
    );
    let products: ProductRecord[];

    if (search) {
      const exactBarcode = (await this.prisma.product.findFirst({
        where: {
          ...where,
          barcode: { equals: search, mode: 'insensitive' },
        },
        include,
      })) as ProductRecord | null;

      if (exactBarcode) {
        products = [exactBarcode];
      } else {
        const exactSku = (await this.prisma.product.findFirst({
          where: {
            ...where,
            sku: { equals: search, mode: 'insensitive' },
          },
          include,
        })) as ProductRecord | null;

        if (exactSku) {
          products = [exactSku];
        } else {
          products = await this.prisma.product.findMany({
            where: {
              ...where,
              name: { contains: search, mode: 'insensitive' },
            },
            include,
            orderBy: { name: 'asc' },
            ...this.buildPagination(query),
          });
        }
      }
    } else {
      products = await this.prisma.product.findMany({
        where,
        include,
        orderBy: { name: 'asc' },
        ...this.buildPagination(query),
      });
    }

    const responseProducts =
      query.requireInventoryBalance === true && query.locationId
        ? products.flatMap((product) => {
            const balance = product.inventoryBalances?.find(
              (item) => item.locationId === query.locationId,
            );
            return this.hasValidOperationalBalance(balance)
              ? [{ ...product, inventoryBalances: [balance] }]
              : [];
          })
        : products;
    const items = responseProducts.map((product) =>
      this.toProductResponse(product, {
        includePurchaseCost:
          currentUser.permissions?.includes(PERMISSIONS.COSTS_READ) ?? false,
      }),
    );

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
    currentUser: ProductReadActor,
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
                where: {
                  ...(query.locationId ? { locationId: query.locationId } : {}),
                  location: this.buildLocationScopeWhere(currentUser),
                },
                include: { location: true },
              },
            }
          : {}),
      },
    })) as ProductRecord | null;

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toProductResponse(product, {
      includeBalances: true,
      includePurchaseCost:
        currentUser.permissions?.includes(PERMISSIONS.COSTS_READ) ?? false,
    });
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    this.assertValidCommercialData(dto);
    this.assertValidFiscalProfile(dto);
    const sku = this.normalizeSku(dto.sku);
    const description = this.normalizeOptionalText(dto.description);
    const categoryId = this.normalizeOptionalText(dto.categoryId);
    const fiscalProfile = this.normalizeFiscalProfile(dto);
    await this.assertSkuAvailable(sku);
    await this.assertCategoryExists(categoryId);

    const product = (await this.prisma.product
      .create({
        data: {
          name: dto.name,
          sku,
          description: description ?? null,
          categoryId: categoryId ?? null,
          presentationType: dto.presentationType,
          salePrice: dto.salePrice,
          purchaseCost: dto.purchaseCost,
          minStock: dto.minStock,
          unit: dto.unit,
          satProductServiceCode: fiscalProfile.satProductServiceCode ?? null,
          satUnitCode: fiscalProfile.satUnitCode ?? null,
          taxObjectCode: fiscalProfile.taxObjectCode ?? null,
          defaultTaxCode: fiscalProfile.defaultTaxCode ?? null,
          defaultFactorType: fiscalProfile.defaultFactorType ?? null,
          defaultRateOrQuota: fiscalProfile.defaultRateOrQuota ?? null,
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
    this.assertValidFiscalProfile(dto);
    const sku = this.normalizeSku(dto.sku);
    const description = this.normalizeOptionalText(dto.description);
    const categoryId = this.normalizeOptionalText(dto.categoryId);
    const fiscalProfile = this.normalizeFiscalProfile(dto);

    if (sku !== undefined) {
      await this.assertSkuAvailable(sku, id);
    }

    await this.assertCategoryExists(categoryId);

    const product = (await this.prisma.product
      .update({
        where: { id: currentProduct.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.sku !== undefined ? { sku } : {}),
          ...(dto.description !== undefined
            ? { description: description ?? null }
            : {}),
          ...(dto.categoryId !== undefined
            ? { categoryId: categoryId ?? null }
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
          ...(dto.satProductServiceCode !== undefined
            ? {
                satProductServiceCode:
                  fiscalProfile.satProductServiceCode ?? null,
              }
            : {}),
          ...(dto.satUnitCode !== undefined
            ? { satUnitCode: fiscalProfile.satUnitCode ?? null }
            : {}),
          ...(dto.taxObjectCode !== undefined
            ? { taxObjectCode: fiscalProfile.taxObjectCode ?? null }
            : {}),
          ...(dto.defaultTaxCode !== undefined
            ? { defaultTaxCode: fiscalProfile.defaultTaxCode ?? null }
            : {}),
          ...(dto.defaultFactorType !== undefined
            ? { defaultFactorType: fiscalProfile.defaultFactorType ?? null }
            : {}),
          ...(dto.defaultRateOrQuota !== undefined
            ? { defaultRateOrQuota: fiscalProfile.defaultRateOrQuota ?? null }
            : {}),
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
    actor: ProductReadActor,
  ): Prisma.ProductWhereInput {
    const locationScope = this.buildLocationScopeWhere(
      actor,
      query.requireInventoryBalance === true,
    );

    return {
      isActive:
        query.requireInventoryBalance === true
          ? true
          : (query.isActive ?? true),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.presentationType
        ? { presentationType: query.presentationType }
        : {}),
      ...(query.unit ? { unit: query.unit } : {}),
      ...(query.requireInventoryBalance === true && query.locationId
        ? {
            inventoryBalances: {
              some: {
                locationId: query.locationId,
                location: {
                  isActive: true,
                  ...(locationScope ?? {}),
                },
              },
            },
          }
        : {}),
    };
  }

  private buildListInclude(
    locationId: string | undefined,
    actor: Pick<AuthenticatedUser, 'role'> &
      Partial<Pick<AuthenticatedUser, 'operationalLocationId'>>,
    requireInventoryBalance = false,
  ) {
    if (!locationId) {
      return PRODUCT_INCLUDE;
    }

    return {
      ...PRODUCT_INCLUDE,
      inventoryBalances: {
        where: {
          locationId,
          location: requireInventoryBalance
            ? {
                isActive: true,
                ...(this.buildLocationScopeWhere(actor, true) ?? {}),
              }
            : this.buildLocationScopeWhere(actor),
        },
        include: { location: true },
      },
    };
  }

  private buildLocationScopeWhere(
    actor: Pick<AuthenticatedUser, 'role'> &
      Partial<Pick<AuthenticatedUser, 'operationalLocationId'>>,
    includeRouteStock = false,
  ): Prisma.OperationalLocationWhereInput | undefined {
    if (actor.role === 'ADMIN') return undefined;

    const locationId = actor.operationalLocationId ?? '__without_location__';
    if (actor.role === 'WAREHOUSE') {
      const locations: Prisma.OperationalLocationWhereInput[] = [
        { id: locationId },
        { parentId: locationId, type: 'BRANCH', isActive: true },
      ];
      if (includeRouteStock && actor.operationalLocationId) {
        locations.push({
          type: 'ROUTE_STOCK',
          routeStockFor: {
            originLocation: {
              OR: [
                { id: locationId },
                {
                  parentId: locationId,
                  type: 'BRANCH',
                  isActive: true,
                },
              ],
            },
          },
        });
      }
      return {
        OR: locations,
      };
    }

    return { id: locationId };
  }

  private hasValidOperationalBalance(
    balance: InventoryBalanceRecord | undefined,
  ): balance is InventoryBalanceRecord {
    if (!balance) return false;

    const quantityKg = this.toFiniteNumber(balance.quantityKg);
    const quantityPieces = this.toFiniteNumber(balance.quantityPieces);
    const reservedQuantityKg = this.toFiniteNumber(balance.reservedQuantityKg);
    const reservedQuantityPieces = this.toFiniteNumber(
      balance.reservedQuantityPieces,
    );
    const minQuantityKg = this.toFiniteNumber(balance.minQuantityKg);
    const minQuantityPieces = this.toFiniteNumber(balance.minQuantityPieces);

    if (
      quantityKg === null ||
      quantityPieces === null ||
      reservedQuantityKg === null ||
      reservedQuantityPieces === null ||
      minQuantityKg === null ||
      minQuantityPieces === null
    ) {
      return false;
    }

    return (
      quantityKg >= 0 &&
      Number.isInteger(quantityPieces) &&
      quantityPieces >= 0 &&
      reservedQuantityKg >= 0 &&
      Number.isInteger(reservedQuantityPieces) &&
      reservedQuantityPieces >= 0 &&
      minQuantityKg >= 0 &&
      Number.isInteger(minQuantityPieces) &&
      minQuantityPieces >= 0 &&
      quantityKg - reservedQuantityKg >= 0 &&
      quantityPieces - reservedQuantityPieces >= 0
    );
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

  private assertValidFiscalProfile(dto: ProductMutationDto): void {
    const satProductServiceCode = this.normalizeOptionalFiscalCode(
      dto.satProductServiceCode,
    );
    if (
      satProductServiceCode &&
      !isValidSatProductServiceCode(satProductServiceCode)
    ) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_SAT_PRODUCT_SERVICE_CODE',
        message: 'satProductServiceCode must contain exactly eight digits',
        fields: ['satProductServiceCode'],
      });
    }

    const satUnitCode = this.normalizeOptionalFiscalCode(dto.satUnitCode);
    if (satUnitCode && !isValidSatUnitCode(satUnitCode)) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_SAT_UNIT_CODE',
        message: 'satUnitCode must contain two or three SAT code characters',
        fields: ['satUnitCode'],
      });
    }

    const taxObjectCode = this.normalizeOptionalFiscalCode(dto.taxObjectCode);
    if (taxObjectCode && !isValidSatProductTaxObjectCode(taxObjectCode)) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_TAX_OBJECT_CODE',
        message: 'taxObjectCode must be a valid SAT c_ObjetoImp code',
        fields: ['taxObjectCode'],
      });
    }

    const defaultTaxCode = this.normalizeOptionalFiscalCode(dto.defaultTaxCode);
    if (defaultTaxCode && !isValidSatProductTaxCode(defaultTaxCode)) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_TAX_CODE',
        message: 'defaultTaxCode must be a valid SAT c_Impuesto code',
        fields: ['defaultTaxCode'],
      });
    }

    if (
      dto.defaultFactorType !== undefined &&
      dto.defaultFactorType !== null &&
      !isValidSatProductFactorType(String(dto.defaultFactorType))
    ) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_FACTOR_TYPE',
        message: 'defaultFactorType must be Tasa, Cuota or Exento',
        fields: ['defaultFactorType'],
      });
    }

    if (
      dto.defaultRateOrQuota !== undefined &&
      dto.defaultRateOrQuota !== null
    ) {
      const rateOrQuota = Number(dto.defaultRateOrQuota);
      const decimalPlaces =
        String(dto.defaultRateOrQuota).split('.')[1]?.length ?? 0;
      if (
        !Number.isFinite(rateOrQuota) ||
        rateOrQuota < 0 ||
        decimalPlaces > 6
      ) {
        throw new BadRequestException({
          code: 'INVALID_PRODUCT_RATE_OR_QUOTA',
          message:
            'defaultRateOrQuota must be a non-negative number with at most six decimals',
          fields: ['defaultRateOrQuota'],
        });
      }
    }
  }

  private normalizeFiscalProfile(dto: ProductMutationDto): {
    satProductServiceCode?: string | null;
    satUnitCode?: string | null;
    taxObjectCode?: ProductTaxObjectCode | null;
    defaultTaxCode?: ProductTaxCode | null;
    defaultFactorType?: ProductFactorType | null;
    defaultRateOrQuota?: number | null;
  } {
    const normalizeCode = (value?: string | null) =>
      this.normalizeOptionalFiscalCode(value);
    const normalizeRateOrQuota = (value?: number | null) => {
      if (value === undefined || value === null) return value;
      return Number(value);
    };

    return {
      satProductServiceCode: normalizeCode(dto.satProductServiceCode),
      satUnitCode: normalizeCode(dto.satUnitCode),
      taxObjectCode: normalizeCode(dto.taxObjectCode) as
        ProductTaxObjectCode | null | undefined,
      defaultTaxCode: normalizeCode(dto.defaultTaxCode) as
        ProductTaxCode | null | undefined,
      defaultFactorType:
        dto.defaultFactorType === undefined || dto.defaultFactorType === null
          ? dto.defaultFactorType
          : normalizeProductFactorType(String(dto.defaultFactorType)),
      defaultRateOrQuota: normalizeRateOrQuota(dto.defaultRateOrQuota),
    };
  }

  private normalizeOptionalFiscalCode(
    value?: string | null,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = normalizeProductFiscalCode(value);
    return normalized.length > 0 ? normalized : null;
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

  private async assertCategoryExists(
    categoryId?: string | null,
  ): Promise<void> {
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

  private normalizeOptionalText(
    value?: string | null,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private toProductResponse(
    product: ProductRecord,
    options: { includeBalances?: boolean; includePurchaseCost?: boolean } = {},
  ): ProductResponse {
    const satProductServiceCode = product.satProductServiceCode ?? null;
    const satUnitCode = product.satUnitCode ?? null;
    const taxObjectCode = (product.taxObjectCode ??
      null) as ProductTaxObjectCode | null;
    const defaultTaxCode = (product.defaultTaxCode ??
      null) as ProductTaxCode | null;
    const defaultFactorType = (product.defaultFactorType ??
      null) as ProductFactorType | null;
    const defaultRateOrQuota = this.toNullableNumber(
      product.defaultRateOrQuota,
    );
    const fiscalProfile = productFiscalProfileStatus({
      satProductServiceCode,
      satUnitCode,
      taxObjectCode,
      defaultTaxCode,
      defaultFactorType,
      defaultRateOrQuota,
    });
    const response: ProductResponse = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      description: product.description,
      categoryId: product.categoryId,
      presentationType: product.presentationType,
      salePrice: this.toNumber(product.salePrice),
      minStock: this.toNumber(product.minStock),
      unit: product.unit,
      satProductServiceCode,
      satUnitCode,
      taxObjectCode,
      defaultTaxCode,
      defaultFactorType,
      defaultRateOrQuota,
      fiscalProfileStatus: fiscalProfile.status,
      fiscalProfileComplete: fiscalProfile.isComplete,
      fiscalProfileMissingFields: fiscalProfile.missingFields,
      fiscalProfileValidationCode: fiscalProfile.validationCode,
      pieceWeightEquivalent: this.toNullableNumber(
        product.pieceWeightEquivalent,
      ),
      equivalentPolicyStatus: product.equivalentPolicyStatus,
      isActive: product.isActive,
    };

    if (options.includePurchaseCost !== false) {
      response.purchaseCost = this.toNumber(product.purchaseCost);
    }

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
    const availability = toInventoryBalanceAvailability(balance);
    const minQuantityKg = this.toNumber(balance.minQuantityKg);
    const minQuantityPieces = balance.minQuantityPieces ?? 0;

    return {
      locationId: balance.locationId,
      ...(balance.location?.name
        ? { locationName: balance.location.name }
        : {}),
      ...availability,
      minQuantityKg,
      minQuantityPieces,
      isLowStock:
        availability.availableQuantityKg < minQuantityKg ||
        availability.availableQuantityPieces < minQuantityPieces,
    };
  }

  private toNullableNumber(value: DecimalLike | null): number | null {
    return value === null ? null : this.toNumber(value);
  }

  private toNumber(value: DecimalLike): number {
    return value === null || value === undefined ? 0 : Number(value.toString());
  }

  private toFiniteNumber(value: DecimalLike): number | null {
    if (value === null || value === undefined) return null;
    const numberValue = Number(value.toString());
    return Number.isFinite(numberValue) ? numberValue : null;
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
