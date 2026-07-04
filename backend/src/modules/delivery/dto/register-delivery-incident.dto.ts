import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { DeliveryOrderStatus, ProductUnit } from '@prisma/client';

export class ReturnedRouteItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

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
}

export class RegisterDeliveryIncidentDto {
  @IsEnum(DeliveryOrderStatus)
  status!: DeliveryOrderStatus;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnedRouteItemDto)
  returnedItems?: ReturnedRouteItemDto[];
}
