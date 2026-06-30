import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { OperationalLocationType } from '@prisma/client';
import { OPERATIONAL_LOCATION_TYPES } from './create-location.dto';

function toOptionalBoolean({ value }: TransformFnParams): unknown {
  if (value === true || value === false) {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}

export class ListLocationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(OPERATIONAL_LOCATION_TYPES)
  type?: OperationalLocationType;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;
}
