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
import { PurchaseStatus } from '@prisma/client';
import {
  CIVIL_DATE_FROM_QUERY_DESCRIPTION,
  CIVIL_DATE_TO_QUERY_DESCRIPTION,
} from '../../../common/utils/civil-date-range';

export class ListPurchasesQueryDto {
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
  supplierId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

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
}
