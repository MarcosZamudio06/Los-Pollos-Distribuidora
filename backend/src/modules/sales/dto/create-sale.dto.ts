import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PaymentMethod, ProductUnit, SaleChannel, SaleDocumentType, SalePaymentType } from '@prisma/client';

export class CreateSaleInitialPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsDateString()
  paidAt!: string;
}

export class CreateSaleItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsEnum(ProductUnit)
  unit!: ProductUnit;

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

  @IsOptional()
  @IsString()
  unitEquivalentId?: string;
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsEnum(SaleChannel)
  saleChannel!: SaleChannel;

  @IsEnum(SaleDocumentType)
  documentType!: SaleDocumentType;

  @IsOptional()
  @IsString()
  physicalFolio?: string;

  @IsOptional()
  @IsBoolean()
  requiresAdministrativeInvoice?: boolean;

  @IsEnum(SalePaymentType)
  paymentType!: SalePaymentType;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSaleInitialPaymentDto)
  initialPayment?: CreateSaleInitialPaymentDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  commercialPolicyId?: string;

  @IsOptional()
  @IsString()
  billingRequestId?: string;

  @IsOptional()
  @IsString()
  administrativeOverrideReason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}
