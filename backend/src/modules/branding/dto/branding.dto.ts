import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateBrandingDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(32)
  shortName?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class BrandingVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}
