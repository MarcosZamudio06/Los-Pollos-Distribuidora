import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { OperationalLocationType } from '@prisma/client';

export const OPERATIONAL_LOCATION_TYPES = {
  BRANCH: 'BRANCH',
  WAREHOUSE: 'WAREHOUSE',
  MIXED: 'MIXED',
  EXTERNAL_POINT_OF_SALE: 'EXTERNAL_POINT_OF_SALE',
  ROUTE_STOCK: 'ROUTE_STOCK',
} as const;

export function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateLocationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  code?: string;

  @IsEnum(OPERATIONAL_LOCATION_TYPES)
  type!: OperationalLocationType;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  parentId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  address?: string;
}
