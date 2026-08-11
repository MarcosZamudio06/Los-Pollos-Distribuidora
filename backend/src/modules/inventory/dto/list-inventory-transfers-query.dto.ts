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
import type { InventoryTransferStatus } from '@prisma/client';
import {
  CIVIL_DATE_FROM_QUERY_DESCRIPTION,
  CIVIL_DATE_TO_QUERY_DESCRIPTION,
} from '../../../common/utils/civil-date-range';

const INVENTORY_TRANSFER_STATUSES = {
  DRAFT: 'DRAFT',
  REQUESTED: 'REQUESTED',
  IN_TRANSIT: 'IN_TRANSIT',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export class ListInventoryTransfersQueryDto {
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
  originLocationId?: string;

  @IsOptional()
  @IsString()
  destinationLocationId?: string;

  @IsOptional()
  @IsEnum(INVENTORY_TRANSFER_STATUSES)
  status?: InventoryTransferStatus;

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
