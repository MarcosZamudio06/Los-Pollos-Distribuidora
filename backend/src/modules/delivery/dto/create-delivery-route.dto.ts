import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateDeliveryRouteOrderDto {
  @IsString()
  @IsNotEmpty()
  saleId!: string;

  @IsOptional()
  @IsString()
  accountReceivableId?: string;

  @IsString()
  @IsNotEmpty()
  deliveryAddress!: string;
}

export class CreateDeliveryRouteDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  originLocationId?: string;

  @IsOptional()
  @IsString()
  routeStockLocationId?: string;

  @IsOptional()
  @IsString()
  routePlanId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryRouteOrderDto)
  orders!: CreateDeliveryRouteOrderDto[];
}


export class AssignDeliveryRouteOrdersDto {
  @IsOptional()
  @IsString()
  routePlanId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryRouteOrderDto)
  orders!: CreateDeliveryRouteOrderDto[];
}
