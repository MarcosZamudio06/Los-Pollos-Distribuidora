import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsEmpty,
  IsEnum,
  IsIn,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import type {
  EquivalentStatus,
  ProductPresentationType,
  ProductUnit,
} from '@prisma/client';
import {
  SAT_PRODUCT_FACTOR_TYPES,
  SAT_PRODUCT_TAX_CODES,
  SAT_PRODUCT_TAX_OBJECT_CODES,
  type ProductFactorType,
  type ProductTaxCode,
  type ProductTaxObjectCode,
} from '../../../../../shared/product-fiscal-catalog';

function normalizeOptionalCode({ value }: TransformFnParams): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalFactorType({ value }: TransformFnParams): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  const factorType = SAT_PRODUCT_FACTOR_TYPES.find(
    (candidate) => candidate.toLowerCase() === normalized,
  );
  return factorType ?? (value.trim().length > 0 ? value.trim() : null);
}

function normalizeOptionalRateOrQuota({ value }: TransformFnParams): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

const PRODUCT_PRESENTATION_TYPES = {
  KG: 'KG',
  WHOLE: 'WHOLE',
  CUT: 'CUT',
} as const;

const PRODUCT_UNITS = {
  KG: 'KG',
  PIECE: 'PIECE',
  KG_AND_PIECE: 'KG_AND_PIECE',
} as const;

const EQUIVALENT_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsEnum(PRODUCT_PRESENTATION_TYPES)
  presentationType!: ProductPresentationType;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  salePrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchaseCost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock!: number;

  @IsEnum(PRODUCT_UNITS)
  unit!: ProductUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  pieceWeightEquivalent?: number;

  @IsOptional()
  @IsEnum(EQUIVALENT_STATUSES)
  equivalentPolicyStatus?: EquivalentStatus;

  /** SAT c_ClaveProdServ; independent from the operational ProductUnit. */
  @IsOptional()
  @Transform(normalizeOptionalCode)
  @IsString()
  @Matches(/^\d{8}$/)
  satProductServiceCode?: string | null;

  /** SAT c_ClaveUnidad; never inferred from ProductUnit. */
  @IsOptional()
  @Transform(normalizeOptionalCode)
  @IsString()
  @Matches(/^[A-Z0-9]{2,3}$/)
  satUnitCode?: string | null;

  @IsOptional()
  @Transform(normalizeOptionalCode)
  @IsString()
  @IsIn([...SAT_PRODUCT_TAX_OBJECT_CODES])
  taxObjectCode?: ProductTaxObjectCode | null;

  @IsOptional()
  @Transform(normalizeOptionalCode)
  @IsString()
  @IsIn([...SAT_PRODUCT_TAX_CODES])
  defaultTaxCode?: ProductTaxCode | null;

  @IsOptional()
  @Transform(normalizeOptionalFactorType)
  @IsString()
  @IsIn([...SAT_PRODUCT_FACTOR_TYPES])
  defaultFactorType?: ProductFactorType | null;

  @IsOptional()
  @Transform(normalizeOptionalRateOrQuota)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  defaultRateOrQuota?: number | null;

  @IsEmpty({ message: 'stock is not accepted on products' })
  stock?: never;
}
