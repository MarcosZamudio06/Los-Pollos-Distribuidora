import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  CollectionStatus,
  PaymentMethod,
  PaymentStatus,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import {
  CIVIL_DATE_FROM_QUERY_DESCRIPTION,
  CIVIL_DATE_TO_QUERY_DESCRIPTION,
} from '../../../common/utils/civil-date-range';

export class ListCustomerSalesQueryDto {
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
  @ApiPropertyOptional({
    description: CIVIL_DATE_FROM_QUERY_DESCRIPTION,
    example: '2026-06-01',
  })
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @ApiPropertyOptional({
    description: CIVIL_DATE_TO_QUERY_DESCRIPTION,
    example: '2026-06-30',
  })
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(SalePaymentType)
  paymentType?: SalePaymentType;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(CollectionStatus)
  collectionStatus?: CollectionStatus;
}

export class ListCustomerPaymentsQueryDto {
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
  @ApiPropertyOptional({
    description: CIVIL_DATE_FROM_QUERY_DESCRIPTION,
    example: '2026-06-01',
  })
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @ApiPropertyOptional({
    description: CIVIL_DATE_TO_QUERY_DESCRIPTION,
    example: '2026-06-30',
  })
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
