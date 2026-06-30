import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { ProductPresentationType, ProductUnit } from '@prisma/client';

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

function toOptionalBoolean({ value }: TransformFnParams): unknown {
  if (value === true || value === false) {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}

export class ListProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(PRODUCT_PRESENTATION_TYPES)
  presentationType?: ProductPresentationType;

  @IsOptional()
  @IsEnum(PRODUCT_UNITS)
  unit?: ProductUnit;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  lowStock?: boolean;
}
