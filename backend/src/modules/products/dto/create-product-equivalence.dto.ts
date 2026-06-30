import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import type { EquivalentStatus, ProductUnit } from '@prisma/client';

const PRODUCT_EQUIVALENCE_UNITS = {
  KG: 'KG',
  PIECE: 'PIECE',
} as const;

const EQUIVALENT_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export class CreateProductEquivalenceDto {
  @IsEnum(PRODUCT_EQUIVALENCE_UNITS)
  unitFrom!: ProductUnit;

  @IsEnum(PRODUCT_EQUIVALENCE_UNITS)
  unitTo!: ProductUnit;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  factor!: number;

  @IsOptional()
  @IsString()
  roundingMode?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsEnum(EQUIVALENT_STATUSES)
  @IsNotEmpty()
  status!: EquivalentStatus;
}
