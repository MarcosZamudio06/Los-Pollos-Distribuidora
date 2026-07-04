import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductUnit } from '@prisma/client';

export class CreatePurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsEnum(ProductUnit)
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

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsString()
  unitEquivalentId?: string;
}

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsOptional()
  @IsBoolean()
  allowCostUpdate?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}
