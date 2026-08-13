import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { GeofenceEventType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_DELIVERY_ZONE_LIST_LIMIT = 100;
export const MAX_GEOFENCE_EVENT_LIST_LIMIT = 500;

function toOptionalBoolean({ value }: TransformFnParams): unknown {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class CreateDeliveryZoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  originLocationId!: string;

  @IsObject()
  geometry!: unknown;
}

export class UpdateDeliveryZoneDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  originLocationId?: string;

  @IsOptional()
  @IsObject()
  geometry?: unknown;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListDeliveryZonesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  originLocationId?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  active?: boolean;

  // Kept as a compatibility alias for the canonical API wording.
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DELIVERY_ZONE_LIST_LIMIT)
  limit?: number;
}

export class ListGeofenceEventsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  zoneId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  routeId?: string;

  @IsOptional()
  @IsEnum(GeofenceEventType)
  type?: GeofenceEventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_GEOFENCE_EVENT_LIST_LIMIT)
  limit?: number;
}
