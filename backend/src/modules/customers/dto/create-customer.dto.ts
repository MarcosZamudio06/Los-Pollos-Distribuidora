import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CreditStatus, CustomerType } from '@prisma/client';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
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
  @Transform(trimString)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(trimString)
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
  @Transform(trimString)
  @IsString()
  taxId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  fiscalAddress?: string;

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
