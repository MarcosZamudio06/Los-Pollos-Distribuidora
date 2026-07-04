import { IsNotEmpty, IsString } from 'class-validator';

export class CancelPurchaseDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
