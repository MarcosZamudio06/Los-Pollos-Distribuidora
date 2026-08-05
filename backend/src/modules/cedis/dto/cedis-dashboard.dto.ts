import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BranchSupplyCycleStatus } from '@prisma/client';

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CedisDashboardQueryDto {
  @IsString()
  @IsNotEmpty()
  cedisLocationId!: string;

  @IsString()
  @Matches(BUSINESS_DATE_PATTERN)
  businessDate!: string;

  @IsOptional()
  @IsEnum(BranchSupplyCycleStatus)
  status?: BranchSupplyCycleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CedisBranchHistoryQueryDto {
  @IsString()
  @Matches(BUSINESS_DATE_PATTERN)
  dateFrom!: string;

  @IsString()
  @Matches(BUSINESS_DATE_PATTERN)
  dateTo!: string;

  @IsOptional()
  @IsEnum(BranchSupplyCycleStatus)
  status?: BranchSupplyCycleStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
