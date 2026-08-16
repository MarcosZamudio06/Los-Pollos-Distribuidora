import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteLogisticsStopDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
