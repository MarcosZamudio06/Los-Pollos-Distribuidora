import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import type { EquivalentStatus, ProductUnit } from '@prisma/client';

const PRODUCT_EQUIVALENCE_UNITS = {
  KG: 'KG',
  PIECE: 'PIECE',
} as const;

const EQUIVALENT_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export class ListProductEquivalencesQueryDto {
  @IsOptional()
  @IsEnum(EQUIVALENT_STATUSES)
  status?: EquivalentStatus;

  @IsOptional()
  @IsEnum(PRODUCT_EQUIVALENCE_UNITS)
  unitFrom?: ProductUnit;

  @IsOptional()
  @IsEnum(PRODUCT_EQUIVALENCE_UNITS)
  unitTo?: ProductUnit;

  @IsOptional()
  @IsDateString()
  date?: string;
}
