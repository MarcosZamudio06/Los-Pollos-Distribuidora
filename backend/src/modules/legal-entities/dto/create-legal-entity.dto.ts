import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SAT_FISCAL_REGIME_CODES } from '../../../../../shared/fiscal-catalog';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeTaxId({ value }: TransformFnParams): unknown {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').trim().toUpperCase()
    : value;
}

function normalizeCode({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function normalizeBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

export class CreateLegalEntityDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName!: string;

  @Transform(normalizeTaxId)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/u)
  taxId!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(/^\d{5}$/)
  fiscalPostalCode?: string | null;

  @IsOptional()
  @Transform(normalizeCode)
  @IsString()
  @IsIn([...SAT_FISCAL_REGIME_CODES])
  fiscalRegime?: string | null;

  @IsOptional()
  @Transform(normalizeBoolean)
  @IsBoolean()
  cfdiEnabled?: boolean;

  @IsOptional()
  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,9}$/)
  defaultSeries?: string | null;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  certificateSerialNumber?: string | null;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(128)
  certificateFingerprint?: string | null;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  certificateSubject?: string | null;

  @IsOptional()
  @IsDateString()
  certificateValidFrom?: string | null;

  @IsOptional()
  @IsDateString()
  certificateValidTo?: string | null;
}
