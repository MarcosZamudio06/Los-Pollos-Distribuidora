import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { BillingRequestStatus } from '@prisma/client';

function trim({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListBillingRequestsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() customerId?: string;
  @IsOptional() @Transform(trim) @IsString() saleId?: string;
  @IsOptional() @IsEnum(BillingRequestStatus) status?: BillingRequestStatus;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Transform(trim) @IsString() locationId?: string;
}

export class CreateBillingRequestDto {
  @Transform(trim) @IsString() @IsNotEmpty() customerId!: string;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() saleId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BillingRequestDocumentDto)
  documents?: BillingRequestDocumentDto[];
  @IsOptional() @Transform(trim) @IsString() retryOfBillingRequestId?: string;
  @Transform(trim) @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @Transform(trim) @IsString() notes?: string;
}

export class BillingRequestDocumentDto {
  @Transform(trim) @IsString() @IsNotEmpty() saleDocumentId!: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BillingRequestItemDto)
  items?: BillingRequestItemDto[];
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) requestedSubtotal!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) requestedTax!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) requestedTotal!: string;
}

export class BillingRequestItemDto {
  @Transform(trim) @IsString() @IsNotEmpty() saleItemId!: string;
}

export class UpdateBillingRequestDto {
  @IsOptional() @IsEnum(BillingRequestStatus) status?: BillingRequestStatus;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() reason?: string;
  @IsOptional() @Transform(trim) @IsString() notes?: string;
}

export class CancelBillingRequestDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @Transform(trim) @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @Transform(trim) @IsString() notes?: string;
}


export class ReviewBillingRequestDto extends CancelBillingRequestDto {}

export class InvoiceSaleItemApplicationDto {
  @Transform(trim) @IsString() @IsNotEmpty() saleItemId!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) subtotalApplied!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) taxApplied!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) totalApplied!: string;
}

export class InvoiceSaleDocumentApplicationDto {
  @Transform(trim) @IsString() @IsNotEmpty() saleDocumentId!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) subtotalApplied!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) taxApplied!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) totalApplied!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceSaleItemApplicationDto)
  items!: InvoiceSaleItemApplicationDto[];
}

export class ExternalInvoiceDto {
  @Transform(trim) @IsString() @IsNotEmpty() legalEntityId!: string;
  @Transform(trim) @IsString() @Matches(/^[A-Z]{3}$/) currencyCode!: string;
  @Transform(trim) @IsString() @IsNotEmpty() series!: string;
  @Transform(trim) @IsString() @IsNotEmpty() folio!: string;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() uuid?: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) subtotal!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) discount!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) tax!: string;
  @Transform(trim) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) total!: string;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() substitutesInvoiceId?: string;
  @ValidateIf((invoice: ExternalInvoiceDto) => Boolean(invoice.substitutesInvoiceId))
  @Transform(trim) @IsString() @IsNotEmpty() substitutionReason?: string;
}

export class LinkInvoiceDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() invoiceId?: string;
  @IsOptional() @ValidateNested() @Type(() => ExternalInvoiceDto) invoice?: ExternalInvoiceDto;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceSaleDocumentApplicationDto)
  applications!: InvoiceSaleDocumentApplicationDto[];
}
