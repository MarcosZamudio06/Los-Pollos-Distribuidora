import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsDecimal,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RegisterReceivablePaymentDto {
  @IsString()
  @IsNotEmpty()
  accountReceivableId!: string;

  /** Strings are canonical at the API boundary; number remains only for legacy callers during migration. */
  @Transform(({ value }: TransformFnParams) => {
    const rawValue = value as unknown;

    return typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? String(rawValue)
      : rawValue;
  })
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  amount!: string | number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    const rawValue = value as unknown;
    return typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? String(rawValue)
      : rawValue;
  })
  @IsDecimal({ decimal_digits: '1,6', force_decimal: false })
  exchangeRateToMxn?: string | number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  fiscalPaymentFormCode?: string;

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
  @IsNotEmpty()
  pointOfSaleDailyCloseId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cashShiftId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  deviceId?: string;

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
  nextPaymentDate?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
