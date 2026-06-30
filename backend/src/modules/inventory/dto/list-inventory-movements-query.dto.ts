import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { InventoryMovementType } from '@prisma/client';

const INVENTORY_MOVEMENT_TYPES = {
  IN: 'IN',
  OUT: 'OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  SALE: 'SALE',
  PURCHASE: 'PURCHASE',
  CANCEL_SALE: 'CANCEL_SALE',
  CANCEL_PURCHASE: 'CANCEL_PURCHASE',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  SHRINKAGE: 'SHRINKAGE',
  RETURN: 'RETURN',
} as const;

export class ListInventoryMovementsQueryDto {
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
  productId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(INVENTORY_MOVEMENT_TYPES)
  type?: InventoryMovementType;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  pointOfSaleDailyCloseId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
