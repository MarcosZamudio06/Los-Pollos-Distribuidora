import { IsDateString, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DeliveryEvidenceType } from '@prisma/client';

export class CaptureDeliveryEvidenceDto {
  @IsEnum(DeliveryEvidenceType)
  type!: DeliveryEvidenceType;

  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsDateString()
  capturedAt!: string;
}
