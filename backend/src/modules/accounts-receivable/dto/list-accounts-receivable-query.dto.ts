import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AgingStatus, CollectionStatus } from '@prisma/client';

function toOptionalBoolean({ value }: TransformFnParams): unknown {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListAccountsReceivableQueryDto {
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
  customerId?: string;

  @IsOptional()
  @IsString()
  saleId?: string;

  @IsOptional()
  @IsString()
  billingRequestId?: string;

  @IsOptional()
  @IsEnum(CollectionStatus)
  status?: CollectionStatus;

  @IsOptional()
  @IsEnum(AgingStatus)
  agingStatus?: AgingStatus;

  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  dueDateTo?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  onlyOverdue?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  onlyActiveBillingRequest?: boolean;
}
