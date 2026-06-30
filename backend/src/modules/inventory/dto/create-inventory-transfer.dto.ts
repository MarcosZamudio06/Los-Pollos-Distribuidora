import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import type { ProductUnit } from '@prisma/client';

const PRODUCT_UNITS = {
  KG: 'KG',
  PIECE: 'PIECE',
  KG_AND_PIECE: 'KG_AND_PIECE',
} as const;

@ValidatorConstraint({ name: 'transferItemQuantity', async: false })
class TransferItemQuantityConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const item = args.object as CreateInventoryTransferItemDto;
    const quantityKg = item.quantityKg ?? 0;
    const quantityPieces = item.quantityPieces ?? 0;

    if (item.unit === PRODUCT_UNITS.KG) {
      return quantityKg > 0 && quantityPieces === 0;
    }

    if (item.unit === PRODUCT_UNITS.PIECE) {
      return quantityPieces > 0 && quantityKg === 0;
    }

    if (item.unit === PRODUCT_UNITS.KG_AND_PIECE) {
      return quantityKg > 0 || quantityPieces > 0;
    }

    return false;
  }

  defaultMessage(): string {
    return 'Each transfer item requires quantityKg, quantityPieces, or both according to unit';
  }
}

export class CreateInventoryTransferItemDto {
  @IsString()
  @IsNotEmpty()
  @Validate(TransferItemQuantityConstraint)
  productId!: string;

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
}

export class CreateInventoryTransferDto {
  @IsString()
  @IsNotEmpty()
  originLocationId!: string;

  @IsString()
  @IsNotEmpty()
  destinationLocationId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryTransferItemDto)
  items!: CreateInventoryTransferItemDto[];
}
