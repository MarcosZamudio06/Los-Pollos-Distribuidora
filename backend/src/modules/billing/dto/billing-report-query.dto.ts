import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsTimeZone, Max, Min } from 'class-validator';
import { SaleDocumentType } from '@prisma/client';
import type { BillingStatus } from '../billability-evaluator';

const BILLING_STATUSES: readonly BillingStatus[] = [
  'NOT_BILLABLE', 'BILLABLE', 'PENDING_INFORMATION', 'REQUESTED', 'IN_PROCESS',
  'PARTIALLY_INVOICED', 'FULLY_INVOICED', 'BLOCKED', 'CANCELLED',
];
const booleanValue = ({ value }: { value: unknown }) => value === true || value === 'true';

export class BillingReportQueryDto {
  @IsOptional() @IsIn(['csv', 'xlsx']) format: 'csv' | 'xlsx' = 'csv';
  @IsOptional() @IsString() @IsTimeZone() timeZone = 'America/Mexico_City';
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() sellerId?: string;
  @IsOptional() @IsString() routeId?: string;
  @IsOptional() @IsIn(Object.values(SaleDocumentType)) documentType?: SaleDocumentType;
  @IsOptional() @IsIn(BILLING_STATUSES) billingStatus?: BillingStatus;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsString() deliveryStatus?: string;
  @IsOptional() @Transform(booleanValue) @IsBoolean() hasRequest?: boolean;
  @IsOptional() @Transform(booleanValue) @IsBoolean() fiscalProfileComplete?: boolean;
  @IsOptional() @Transform(booleanValue) @IsBoolean() overdue?: boolean;
  @IsOptional() @Transform(booleanValue) @IsBoolean() blocked?: boolean;
  @IsOptional() @IsString() folio?: string;
  @IsOptional() @IsString() uuid?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['issuedAt', 'saleNumber', 'customerName', 'documentType', 'billingStatus', 'pendingInvoice', 'total']) sortBy: string = 'issuedAt';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
