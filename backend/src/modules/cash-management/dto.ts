import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashMovementType } from '@prisma/client';

export class CreateCashTerminalDto {
  @IsString() @IsNotEmpty() operationalLocationId!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() deviceId!: string;
}

export class ListCashTerminalQueryDto {
  @IsOptional() @IsString() operationalLocationId?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) isActive?: boolean;
  @IsOptional() @IsString() @IsNotEmpty() deviceId?: string;
}

export class UpdateCashTerminalDto {
  @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() deviceId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RequestCashTerminalActivationDto {
  @IsString() @IsNotEmpty() deviceId!: string;
  @IsOptional() @IsString() @IsNotEmpty() operationalLocationId?: string;
}

export class ActivateMigratedCashTerminalDto {
  @IsString() @IsNotEmpty() activationCode!: string;
}

export class OpenCashShiftDto {
  @IsString() @IsNotEmpty() terminalId!: string;
  @IsString() @IsNotEmpty() deviceId!: string;
  @IsDateString() businessDate!: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialCashFund?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) initialCashIn?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) initialCashOut?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CurrentCashShiftQueryDto {
  @IsString() @IsNotEmpty() deviceId!: string;
}

export class CloseCashShiftDto {
  @IsString() @IsNotEmpty() deviceId!: string;
  @Type(() => Number) @IsNumber() @Min(0) cashCountedTotal!: number;
}

export class CreateCashShiftMovementDto {
  @IsString() @IsNotEmpty() deviceId!: string;
  @IsEnum(CashMovementType) type!: CashMovementType;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsString() reference?: string;
}
