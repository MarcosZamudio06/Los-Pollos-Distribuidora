import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { BillingRequestStatus } from '@prisma/client';

function trim({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListBillingRequestsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() customerId?: string;
  @IsOptional() @Transform(trim) @IsString() saleId?: string;
  @IsOptional() @IsEnum(BillingRequestStatus) status?: BillingRequestStatus;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Transform(trim) @IsString() locationId?: string;
}

export class CreateBillingRequestDto {
  @Transform(trim) @IsString() @IsNotEmpty() customerId!: string;
  @Transform(trim) @IsString() @IsNotEmpty() saleId!: string;
  @Transform(trim) @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @Transform(trim) @IsString() notes?: string;
}

export class UpdateBillingRequestDto {
  @IsOptional() @IsEnum(BillingRequestStatus) status?: BillingRequestStatus;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() reason?: string;
  @IsOptional() @Transform(trim) @IsString() notes?: string;
}

export class CancelBillingRequestDto {
  @Transform(trim) @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @Transform(trim) @IsString() notes?: string;
}
