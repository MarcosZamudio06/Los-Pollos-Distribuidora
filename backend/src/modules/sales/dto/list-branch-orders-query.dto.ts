import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SaleChannel, SalePaymentType } from '@prisma/client';

export class ListBranchOrdersQueryDto {
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(SaleChannel)
  saleChannel?: SaleChannel;

  @IsOptional()
  @IsEnum(SalePaymentType)
  paymentType?: SalePaymentType;
}
