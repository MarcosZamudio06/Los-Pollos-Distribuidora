import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { InventoryMovementType, ProductUnit } from '@prisma/client';

const INVENTORY_ADJUSTMENT_TYPES = {
  IN: 'IN',
  OUT: 'OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  SHRINKAGE: 'SHRINKAGE',
  RETURN: 'RETURN',
} as const;

const PRODUCT_UNITS = {
  KG: 'KG',
  PIECE: 'PIECE',
  KG_AND_PIECE: 'KG_AND_PIECE',
} as const;

export class CreateInventoryAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsEnum(INVENTORY_ADJUSTMENT_TYPES)
  type!: InventoryMovementType;

  @IsEnum(PRODUCT_UNITS)
  unit!: ProductUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantityKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityPieces?: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  routeSettlementId?: string;

  @IsOptional()
  @IsString()
  pointOfSaleDailyCloseId?: string;
}
