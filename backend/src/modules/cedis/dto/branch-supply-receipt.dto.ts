import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const RECEIPT_STATUSES = {
  PENDING: 'PENDING',
  RECEIVED: 'RECEIVED',
} as const;

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListIncomingSuppliesQueryDto {
  @IsString()
  @Matches(BUSINESS_DATE_PATTERN)
  businessDate!: string;

  @IsOptional()
  @IsString()
  branchLocationId?: string;

  @IsOptional()
  @IsEnum(RECEIPT_STATUSES)
  status?: (typeof RECEIPT_STATUSES)[keyof typeof RECEIPT_STATUSES];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class IncomingSupplyReceiptItemDto {
  @IsString()
  @IsNotEmpty()
  transferItemId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantityKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityPieces?: number;
}

export class ReceiveIncomingSupplyDto {
  @IsInt()
  @Min(1)
  expectedCycleVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => IncomingSupplyReceiptItemDto)
  @ArrayMinSize(1)
  items!: IncomingSupplyReceiptItemDto[];
}
