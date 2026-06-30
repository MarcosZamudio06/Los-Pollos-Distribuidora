import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { InventoryTransferStatus } from '@prisma/client';

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
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
