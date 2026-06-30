import { Transform, type TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateCategoryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  description?: string;
}
