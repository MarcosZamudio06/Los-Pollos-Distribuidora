import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const OPERATIONAL_CONFIG_VALUE_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON'] as const;
export const OPERATIONAL_CONFIG_SCOPES = ['GLOBAL', 'LOCATION', 'ROLE'] as const;

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parseBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListOperationalConfigQueryDto {
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
  @Transform(trimString)
  @IsString()
  key?: string;

  @IsOptional()
  @Transform(trimString)
  @IsIn(OPERATIONAL_CONFIG_SCOPES)
  scope?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  locationId?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class CreateOperationalConfigDto {
  @Transform(trimString)
  @IsString()
  key!: string;

  @Transform(trimString)
  @IsString()
  value!: string;

  @Transform(trimString)
  @IsIn(OPERATIONAL_CONFIG_VALUE_TYPES)
  valueType!: string;

  @Transform(trimString)
  @IsIn(OPERATIONAL_CONFIG_SCOPES)
  scope!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  description?: string;

  @Transform(trimString)
  @IsString()
  effectiveFrom!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateOperationalConfigDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  key?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  value?: string;

  @IsOptional()
  @Transform(trimString)
  @IsIn(OPERATIONAL_CONFIG_VALUE_TYPES)
  valueType?: string;

  @IsOptional()
  @Transform(trimString)
  @IsIn(OPERATIONAL_CONFIG_SCOPES)
  scope?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
