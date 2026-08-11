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
  SaleChannel,
  SaleDocumentType,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import {
  CIVIL_DATE_FROM_QUERY_DESCRIPTION,
  CIVIL_DATE_TO_QUERY_DESCRIPTION,
} from '../../../common/utils/civil-date-range';

export class ListSalesQueryDto {
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
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(SalePaymentType)
  paymentType?: SalePaymentType;

  @IsOptional()
  @IsEnum(SalePaymentType)
  saleType?: SalePaymentType;

  @IsOptional()
  @IsEnum(CollectionStatus)
  collectionStatus?: CollectionStatus;

  @IsOptional()
  @IsEnum(SaleChannel)
  saleChannel?: SaleChannel;

  @IsOptional()
  @IsEnum(SaleDocumentType)
  documentType?: SaleDocumentType;

  @IsOptional()
  @IsString()
  physicalFolio?: string;

  @IsOptional()
  @IsString()
  pointOfSaleDailyCloseId?: string;
}
