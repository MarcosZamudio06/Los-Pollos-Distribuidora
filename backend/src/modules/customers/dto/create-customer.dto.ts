import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { CreditStatus, CustomerType } from '@prisma/client';
import {
  SAT_CFDI_USE_CODES,
  SAT_FISCAL_REGIME_CODES,
} from '../../../../../shared/fiscal-catalog';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function normalizeTaxId({ value }: TransformFnParams): unknown {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').trim().toUpperCase()
    : value;
}

function normalizeFiscalCode({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateCustomerDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  customerNumber?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  commercialName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  address?: string;

  @IsEnum(CustomerType)
  customerType!: CustomerType;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  priceListId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditDays?: number;

  @IsOptional()
  @IsEnum(CreditStatus)
  creditStatus?: CreditStatus;

  @IsOptional()
  @IsBoolean()
  requiresBilling?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  fiscalName?: string;

  @IsOptional()
  @Transform(normalizeTaxId)
  @IsString()
  @ValidateIf(
    (_, value) => value !== undefined && value !== null && value !== '',
  )
  @Matches(/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/u)
  taxId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  fiscalAddress?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @ValidateIf(
    (_, value) => value !== undefined && value !== null && value !== '',
  )
  @Matches(/^\d{5}$/)
  fiscalPostalCode?: string;

  @IsOptional()
  @Transform(normalizeFiscalCode)
  @IsString()
  @ValidateIf(
    (_, value) => value !== undefined && value !== null && value !== '',
  )
  @IsIn([...SAT_FISCAL_REGIME_CODES])
  fiscalRegime?: string;

  @IsOptional()
  @Transform(normalizeFiscalCode)
  @IsString()
  @ValidateIf(
    (_, value) => value !== undefined && value !== null && value !== '',
  )
  @IsIn([...SAT_CFDI_USE_CODES])
  fiscalUseCode?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  assignedRouteId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  commercialPolicyId?: string;
}
