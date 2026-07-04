import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DeliveryRouteStatus } from '@prisma/client';

export class ListDeliveryRoutesQueryDto {
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
  driverId?: string;

  @IsOptional()
  @IsEnum(DeliveryRouteStatus)
  status?: DeliveryRouteStatus;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  originLocationId?: string;
}
