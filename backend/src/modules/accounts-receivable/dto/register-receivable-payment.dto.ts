import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RegisterReceivablePaymentDto {
  @IsString()
  @IsNotEmpty()
  accountReceivableId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  appliedDocumentId?: string;

  @IsOptional()
  @IsString()
  appliedDocumentType?: string;

  @IsOptional()
  @IsString()
  routeId?: string;

  @IsOptional()
  @IsString()
  routeSettlementId?: string;

  @IsOptional()
  @IsString()
  collectedByUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  collectionPass?: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
