import { Type } from 'class-transformer';
import {
  IsEmpty,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import type {
  EquivalentStatus,
  ProductPresentationType,
  ProductUnit,
} from '@prisma/client';

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

  @IsEmpty({ message: 'stock is not accepted on products' })
  stock?: never;
}
