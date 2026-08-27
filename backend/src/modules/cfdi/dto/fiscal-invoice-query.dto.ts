import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CfdiDocumentType, InvoiceFiscalStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class ListFiscalInvoicesQueryDto {
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

  @IsOptional()
  @Transform(trim)
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @Transform(trim)
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  customerId?: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  taxId?: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  uuid?: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  series?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  folio?: string;

  @IsOptional()
  @IsEnum(InvoiceFiscalStatus)
  fiscalStatus?: InvoiceFiscalStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  legalEntityId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(CfdiDocumentType)
  cfdiType?: CfdiDocumentType;
}
