import { IsNotEmpty, IsString } from 'class-validator';

export class CancelInventoryTransferDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
