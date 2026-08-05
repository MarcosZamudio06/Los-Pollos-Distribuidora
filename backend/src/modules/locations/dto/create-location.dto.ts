import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import type { OperationalLocationType } from '@prisma/client';

export const OPERATIONAL_LOCATION_TYPES = {
  BRANCH: 'BRANCH',
  WAREHOUSE: 'WAREHOUSE',
  DISTRIBUTION_CENTER: 'DISTRIBUTION_CENTER',
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

  @Transform(({ value }: TransformFnParams) =>
    value === null || value === '' ? null : Number(value),
  )
  @ValidateIf(
    ({ latitude, longitude }: CreateLocationDto) =>
      latitude !== null &&
      longitude !== null &&
      (latitude !== undefined || longitude !== undefined),
  )
  @IsLatitude()
  latitude?: number | null;

  @Transform(({ value }: TransformFnParams) =>
    value === null || value === '' ? null : Number(value),
  )
  @ValidateIf(
    ({ latitude, longitude }: CreateLocationDto) =>
      latitude !== null &&
      longitude !== null &&
      (latitude !== undefined || longitude !== undefined),
  )
  @IsLongitude()
  longitude?: number | null;
}
