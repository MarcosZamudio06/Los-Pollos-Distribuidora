import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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

export class GetProductQueryDto {
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  includeBalances?: boolean;

  @IsOptional()
  @IsString()
  locationId?: string;
}
