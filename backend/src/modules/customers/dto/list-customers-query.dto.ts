import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AgingStatus, CreditStatus, CustomerType } from '@prisma/client';

export type CustomerAgingFilter = AgingStatus | 'LATE';

const customerAgingFilters = [AgingStatus.CURRENT, AgingStatus.DUE_SOON, AgingStatus.OVERDUE, 'LATE'] as const;

function toOptionalBoolean({ value }: TransformFnParams): unknown {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListCustomersQueryDto {
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
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsEnum(CreditStatus)
  creditStatus?: CreditStatus;

  @IsOptional()
  @IsString()
  commercialPolicyId?: string;

  @IsOptional()
  @IsString()
  assignedRouteId?: string;

  @IsOptional()
  @IsIn(customerAgingFilters)
  agingStatus?: CustomerAgingFilter;

  @IsOptional()
  @IsIn(customerAgingFilters)
  cartera?: CustomerAgingFilter;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;
}
