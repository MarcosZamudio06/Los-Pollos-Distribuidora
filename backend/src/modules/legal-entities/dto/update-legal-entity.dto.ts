import { Transform, type TransformFnParams } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateLegalEntityDto } from './create-legal-entity.dto';

function normalizeBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

export class UpdateLegalEntityDto extends PartialType(CreateLegalEntityDto) {
  @IsOptional()
  @Transform(normalizeBoolean)
  @IsBoolean()
  isActive?: boolean;
}
