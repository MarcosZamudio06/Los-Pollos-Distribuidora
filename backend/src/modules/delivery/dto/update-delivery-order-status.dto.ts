import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DeliveryOrderStatus } from '@prisma/client';

export class UpdateDeliveryOrderStatusDto {
  @IsEnum(DeliveryOrderStatus)
  status!: DeliveryOrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  deliveredAt?: string;
}
