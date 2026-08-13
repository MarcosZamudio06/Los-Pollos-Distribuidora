import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const RETURN_STATUSES = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ALL: 'ALL',
} as const;
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListBranchReturnsQueryDto {
  @IsString()
  @Matches(BUSINESS_DATE_PATTERN)
  businessDate!: string;

  @IsOptional()
  @IsEnum(RETURN_STATUSES)
  status?: (typeof RETURN_STATUSES)[keyof typeof RETURN_STATUSES];

  @IsOptional()
  @IsString()
  branchLocationId?: string;

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
