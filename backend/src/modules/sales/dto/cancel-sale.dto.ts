import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CancelSaleDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
