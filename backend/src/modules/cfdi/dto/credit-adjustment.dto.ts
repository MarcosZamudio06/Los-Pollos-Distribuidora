import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmpty,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MONEY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const trimUpper = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreditAdjustmentLineDto {
  @IsString()
  @Transform(trim)
  @MaxLength(64)
  invoiceConceptId!: string;

  @IsString()
  @Transform(trim)
  @Matches(MONEY, { message: 'CREDIT_NOTE_AMOUNT_INVALID' })
  creditTotal!: string;

  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  tax?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  subtotal?: never;
}

export class CreditAdjustmentApplicationDto {
  @IsString()
  @Transform(trim)
  @MaxLength(64)
  invoiceId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreditAdjustmentLineDto)
  lines!: CreditAdjustmentLineDto[];

  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  uuid?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  relationshipTypeCode?: never;
}

export class CreateCreditAdjustmentDto {
  @Transform(trimUpper)
  @IsIn([
    'APPROVED_RETURN',
    'BONUS',
    'POST_SALE_DISCOUNT',
    'COMMERCIAL_ADJUSTMENT',
  ])
  sourceType!:
    | 'APPROVED_RETURN'
    | 'BONUS'
    | 'POST_SALE_DISCOUNT'
    | 'COMMERCIAL_ADJUSTMENT';

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(255)
  sourceReference?: string;

  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(1_000)
  internalReason!: string;

  @IsString()
  @Transform(trimUpper)
  @Matches(/^\d{2}$/, { message: 'INVALID_PAYMENT_CONFIGURATION' })
  paymentFormCode!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreditAdjustmentApplicationDto)
  applications!: CreditAdjustmentApplicationDto[];

  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  uuid?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  total?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  tfd?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  seals?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  certificateNumber?: never;
}

export class CreditAdjustmentVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
