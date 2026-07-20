import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsDefined, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown => typeof value === 'string' ? value.trim() : value;

export class CancelInvoiceDto {
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
