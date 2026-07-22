import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CustomerType, OverdueBlockingMode } from '@prisma/client';
export { OverdueBlockingMode } from '@prisma/client';

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
  @IsEnum(OverdueBlockingMode)
  overdueBlockingMode?: OverdueBlockingMode;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  creditLimitBlockingMode?: string;

  @IsOptional()
  @IsBoolean()
  allowAdministrativeOverride?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maximumDiscountPercentage?: number;

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

export class CreateDiscountAuthorizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  authorizedForUserId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  maximumPercentage!: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  evidence!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
