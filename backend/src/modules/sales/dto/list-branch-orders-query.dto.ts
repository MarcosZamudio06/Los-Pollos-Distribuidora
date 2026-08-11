import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SaleChannel, SalePaymentType } from '@prisma/client';
import {
  CIVIL_DATE_FROM_QUERY_DESCRIPTION,
  CIVIL_DATE_TO_QUERY_DESCRIPTION,
} from '../../../common/utils/civil-date-range';

export class ListBranchOrdersQueryDto {
  @IsString()
  @IsNotEmpty()
  locationId!: string;

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
  @IsEnum(SaleChannel)
  saleChannel?: SaleChannel;

  @IsOptional()
  @IsEnum(SalePaymentType)
  paymentType?: SalePaymentType;
}
