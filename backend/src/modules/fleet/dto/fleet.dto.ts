import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_FLEET_POSITION_HISTORY_LIMIT = 1000;

export class PublishFleetPositionDto {
  @IsString()
  @MaxLength(160)
  clientEventId!: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  accuracyMeters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  speedKph?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(359.999)
  headingDegrees?: number;

  @IsDateString()
  recordedAt!: string;
}

export class FleetLiveQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  originLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  routeId?: string;
}

export class FleetRoutePositionsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FLEET_POSITION_HISTORY_LIMIT)
  limit?: number;
}

export enum FleetHeatmapMetric {
  DELIVERIES = 'DELIVERIES',
  INCIDENTS = 'INCIDENTS',
}

export const MAX_FLEET_HEATMAP_FEATURES = 5_000;

export class FleetHeatmapQueryDto {
  @IsEnum(FleetHeatmapMetric)
  @IsNotEmpty()
  metric!: FleetHeatmapMetric;

  @IsDateString()
  @IsNotEmpty()
  from!: string;

  @IsDateString()
  @IsNotEmpty()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  originLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  routeId?: string;
}
