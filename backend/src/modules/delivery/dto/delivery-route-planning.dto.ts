import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class EligibleSalesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() originLocationId?: string;
}

export class GeocodingSearchQueryDto {
  @IsString() @MinLength(3) @MaxLength(200) q!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) limit?: number;
}

export class GeocodingReverseQueryDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
}

export class CreateDeliveryRoutePlanStopDto {
  @IsString() @IsNotEmpty() saleId!: string;
  @IsOptional() @IsString() accountReceivableId?: string;
  @IsString() @IsNotEmpty() @MaxLength(500) deliveryAddress!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsString() geocoderOsmType?: string;
  @IsOptional() @IsString() geocoderOsmId?: string;
}

export class CreateDeliveryRoutePlanDto {
  @IsOptional() @IsString() routeId?: string;
  @IsString() @IsNotEmpty() driverId!: string;
  @IsDateString() scheduledDate!: string;
  @IsString() @IsNotEmpty() originLocationId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateDeliveryRoutePlanStopDto)
  stops!: CreateDeliveryRoutePlanStopDto[];
}
