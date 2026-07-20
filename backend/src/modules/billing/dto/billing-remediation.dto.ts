import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsISO8601, IsNotEmpty, IsNumberString, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class BillingRemediationQueryDto {
  @IsOptional() @IsIn(['OPEN', 'RESOLVED', 'ALL']) status: 'OPEN' | 'RESOLVED' | 'ALL' = 'OPEN';
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class BillingRemediationItemCorrectionDto {
  @IsString() @IsNotEmpty() saleItemId!: string;
  @IsNumberString() subtotal!: string;
  @IsNumberString() discount!: string;
  @IsNumberString() tax!: string;
  @IsNumberString() total!: string;
}

export class BillingRemediationCorrectionDto {
  @IsOptional() @IsString() @IsNotEmpty() legalEntityId?: string;
  @IsOptional() @IsString() @IsNotEmpty() selectedSaleDocumentId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BillingRemediationItemCorrectionDto) items?: BillingRemediationItemCorrectionDto[];
  @IsOptional() @IsNumberString() subtotal?: string;
  @IsOptional() @IsNumberString() discount?: string;
  @IsOptional() @IsNumberString() tax?: string;
  @IsOptional() @IsNumberString() total?: string;
}

export class ResolveBillingRemediationDto {
  @IsISO8601() expectedUpdatedAt!: string;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => BillingRemediationCorrectionDto) correction?: BillingRemediationCorrectionDto;
}
