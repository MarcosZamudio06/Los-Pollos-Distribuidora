import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const trimUpper = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : (value as unknown);

export class CancelInvoiceDto {
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @Transform(trimUpper)
  @IsDefined()
  @IsIn(['01', '02', '03', '04'])
  cancellationMotiveCode!: '01' | '02' | '03' | '04';

  @Transform(trim)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  internalReason!: string;

  /** Server resolves replacementUuid from this persisted Invoice id. */
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  replacementInvoiceId?: string;
}
