import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class OpenDailyCloseDto {
  @IsString() @IsNotEmpty() operationalLocationId!: string;
  @IsDateString() businessDate!: string;
  @IsOptional() @IsString() notes?: string;
}

export class ListDailyCloseQueryDto {
  @IsOptional() @IsString() operationalLocationId?: string;
  @IsOptional() @IsDateString() businessDate?: string;
}

export class VersionedDailyCloseDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class ReasonedDailyCloseDto extends VersionedDailyCloseDto {
  @IsString() @IsNotEmpty() reason!: string;
}

export class CreateExpenseDto {
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class RecordCashCountDto {
  @Type(() => Number) @IsNumber() @Min(0) cashCountedTotal!: number;
}

export class CreateScaleTicketDto {
  @IsString() @IsNotEmpty() physicalFolio!: string;
  @IsDateString() capturedDate!: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) pieceCount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() notes?: string;
}
