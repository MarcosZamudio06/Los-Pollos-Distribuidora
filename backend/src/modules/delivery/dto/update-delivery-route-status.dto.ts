import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DeliveryRouteStatus } from '@prisma/client';

export class UpdateDeliveryRouteStatusDto {
  @IsEnum(DeliveryRouteStatus)
  status!: DeliveryRouteStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
