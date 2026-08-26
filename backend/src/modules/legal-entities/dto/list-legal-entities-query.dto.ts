import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function normalizeBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

export class ListLegalEntitiesQueryDto {
  @IsOptional()
  @Transform(normalizeBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    const rawValue = value as unknown;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
