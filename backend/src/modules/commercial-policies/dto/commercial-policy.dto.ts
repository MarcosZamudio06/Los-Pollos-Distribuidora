import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CustomerType } from '@prisma/client';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parseBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListCommercialPoliciesQueryDto {
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
  search?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCommercialPolicyDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  name?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  priceListId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultCreditLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultCreditDays?: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  overdueBlockingMode?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  creditLimitBlockingMode?: string;

  @IsOptional()
  @IsBoolean()
  allowAdministrativeOverride?: boolean;

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

export class UpdateCommercialPolicyDto extends CreateCommercialPolicyDto {}
